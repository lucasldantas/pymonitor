// ========= Config =========
const AUTO_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutos em milissegundos
const BASE_CSV_URL = './data/'; // Caminho corrigido para a pasta 'data/'
const MAX_TTL = 30; // Limite fixo de hops para o CSV (Deve ser igual ao Python)

// ========= Estado (Instâncias de Gráfico) =========
let allData = [];
let currentDataToDisplay = [];
let autoUpdateTimer = null; 

let chartInstanceMeet = null;
let chartInstanceMaquina = null;
let chartInstanceVelocidade = null;
let chartInstanceTracert = null;

// ========= Utils =========
function getCurrentDateFormatted() {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
}

function getFileName() {
    const date = document.getElementById('dateSelect').value;
    return `py_monitor_${date}.csv`;
}

// NOVO: Função para checar a validade de um objeto Date
function isDateValid(date) {
    return date instanceof Date && !isNaN(date.getTime());
}

// NOVO: Parse robusto do Timestamp (Corrigido para formato YYYY-MM-DD HH:MM:SS)
function parseTimestamp(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    
    // Formato do Python: YYYY-MM-DD HH:MM:SS
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
        // Substituir '-' por '/' faz o JS tentar interpretar como data LOCAL (MM/DD/YYYY ou YYYY/MM/DD)
        // Como o ano é 4 dígitos, ele tende a interpretar YYYY/MM/DD, o que é o que queremos.
        let local_s = s.replace(/-/g, '/');
        
        // Tenta parsear como data local (o mais robusto para este formato)
        const d_local = new Date(local_s);
        if (isDateValid(d_local)) return d_local;

        // Fallback: Tentativa de parse componente a componente para garantir
        const [datePart, timePart] = s.split(' ');
        const [Y, M, D] = datePart.split('-');
        const [h, m, sec] = timePart.split(':');
        
        // Month no JavaScript é 0-indexed (M-1)
        const d_comp = new Date(Y, M - 1, D, h, m, sec);
        if (isDateValid(d_comp)) return d_comp;
    }

    // Fallback genérico (se o formato não for o padrão)
    const d = new Date(s);
    return isDateValid(d) ? d : null;
}

// Função auxiliar para garantir que a string seja um float, retornando 0 em caso de falha.
const safeParseFloat = (value) => {
    if (value === undefined || value === null || value === "") return 0;
    return parseFloat(String(value).trim().replace(',', '.')) || 0;
}


// Normaliza nomes de colunas e tipos
function typeConverter(row) {
    if (!row.Timestamp) return null; 

    const newRow = {};
    for (const key in row) {
        // Sanitiza a chave: remove (), %, e espaços (mantendo o ponto).
        const cleanKey = key.replace(/[\(\)%]/g, '').replace(/ /g, '_'); 
        newRow[cleanKey] = row[key];
    }
    
    // --- CHECAGEM CRÍTICA DO HOSTNAME ---
    const hostnameValue = newRow.Hostname ? newRow.Hostname.trim() : '';
    if (!hostnameValue || hostnameValue === "N/A" || hostnameValue === "") return null;
    newRow.Hostname = hostnameValue; 
    
    // 1. APLICAÇÃO: Parse robusto do Timestamp (CORRIGIDO)
    newRow.Timestamp = parseTimestamp(newRow.Timestamp);
    if (!newRow.Timestamp) return null; // Linha descartada se o Timestamp for inválido
    
    // 2. Conversão Numérica CRÍTICA
    newRow.Uso_CPU = safeParseFloat(newRow.Uso_CPU);
    newRow.Uso_RAM = safeParseFloat(newRow.Uso_RAM);
    newRow.Uso_Disco = safeParseFloat(newRow.Uso_Disco);
    newRow.Carga_Computador = safeParseFloat(newRow.Carga_Computador); 

    // Velocidade
    newRow.DownloadMbps = safeParseFloat(newRow.DownloadMbps); 
    newRow.UploadMbps = safeParseFloat(newRow.UploadMbps);     
    newRow.Latencia_Speedtestms = safeParseFloat(newRow.Latencia_Speedtestms); 

    // Saúde do Meet
    newRow.Saude_Meet0100 = safeParseFloat(newRow.Saude_Meet0100); 
    newRow.Latencia_Meet_Media_ms = safeParseFloat(newRow.Latencia_Meet_Media_ms); 
    newRow.Jitter_Meetms = safeParseFloat(newRow.Jitter_Meetms); 
    newRow.Perda_Meet = safeParseFloat(newRow.Perda_Meet);       

    // Hops
    for (let i = 1; i <= MAX_TTL; i++) {
        const ipKey_Sanitizada = `Hop_IP_${String(i).padStart(2, '0')}`;
        const latKey_Sanitizada = `Hop_LAT_${String(i).padStart(2, '0')}ms`;
        
        newRow[latKey_Sanitizada] = safeParseFloat(newRow[latKey_Sanitizada]);
        newRow[ipKey_Sanitizada] = (newRow[ipKey_Sanitizada] ?? '').toString();
    }
    
    return newRow;
}

// --------------------------------------------------------------------------
// Lógica de Tema e Inicialização
// --------------------------------------------------------------------------

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark);
    drawAllCharts(currentDataToDisplay);
}

function applySavedTheme() {
    const saved = localStorage.getItem('darkMode');
    const checkbox = document.getElementById('checkbox');
    if (saved === 'true') {
        document.body.classList.add('dark-mode');
        checkbox.checked = true;
    }
    checkbox.addEventListener('change', toggleDarkMode);
    return saved === 'true'; 
}

function startAutoUpdate() {
    if (autoUpdateTimer) clearInterval(autoUpdateTimer);
    autoUpdateTimer = setInterval(() => {
        console.log('Autoatualizando dados...');
        initMonitor();
    }, AUTO_UPDATE_INTERVAL);
}

// --------------------------------------------------------------------------
// Lógica de Carregamento e PapaParse
// --------------------------------------------------------------------------

function initMonitor() {
    const isDark = applySavedTheme(); 
     
    const statusElement = document.getElementById('statusMessage');
    const fileName = getFileName();
    const fullURL = BASE_CSV_URL + fileName;

    showStatus('loading', `Carregando: ${fileName}...`);
    allData = []; 
    currentDataToDisplay = [];

    document.getElementById('startTime').value = "00:00";
    document.getElementById('endTime').value = "23:59";
    document.getElementById('event-details').style.display = 'none';
    
    const hostnameInput = document.getElementById('hostnameInput');
    if (!hostnameInput.value) {
        hostnameInput.value = 'all';
    }

    Papa.parse(fullURL, {
        download: true, 
        header: true,   
        skipEmptyLines: true,
        worker: false,
        downloadRequestHeaders: {
            'Cache-Control': 'no-cache', 
            'Pragma': 'no-cache',
            'If-Modified-Since': 'Sat, 01 Jan 2000 00:00:00 GMT'
        },

        complete: (results) => {
            
            allData = results.data.map(typeConverter).filter(r => r !== null); 
            destroyAllCharts(); 
            
            if (allData.length === 0) {
                showStatus('error', `Nenhuma linha de dados válida encontrada no arquivo.`);
                document.getElementById('hostnames').innerHTML = '<option value="all" label="Todas as Máquinas"></option>';
                return;
            }
            
            showStatus('success', `Dados prontos. ${allData.length} registros válidos.`);
            populateHostnames(allData);
            filterChart();
        },
        error: (err) => {
            console.error('Erro ao carregar o CSV:', err);
            showStatus('error', `ERRO: Não foi possível carregar o arquivo ${fileName}. Verifique a data.`);
            destroyAllCharts();
        }
    });
}

function populateHostnames(data) {
    // 1. Coleta Hostnames válidos
    const hostnames = [...new Set(data.map(d => d.Hostname).filter(Boolean))].sort();
    const datalist = document.getElementById('hostnames');
    const input = document.getElementById('hostnameInput');
    const previousValue = input.value; // Pega o valor atual (ex: 'all')

    datalist.innerHTML = '';

    // 2. Cria a Opção 'all'
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.label = 'Todas as Máquinas';
    datalist.appendChild(allOption);

    // 3. Cria as Opções de Hostnames
    hostnames.forEach(host => {
        const option = document.createElement('option');
        option.value = host;
        option.label = host; 
        datalist.appendChild(option);
    });

    // 4. Define o Valor do Input
    // Se o valor anterior for um hostname válido, mantém. Senão, mantém 'all'.
    if (hostnames.includes(previousValue) || previousValue === 'all') {
        input.value = previousValue;
    } else if (hostnames.length > 0) {
        // Se o valor anterior era inválido, mas temos máquinas, mantém 'all' para filtrar tudo.
        input.value = 'all';
    } else {
        // Nenhuma máquina, força 'all'
        input.value = 'all';
    }
    
    // ATENÇÃO CRÍTICA: Forçar o foco e desfoque no input pode fazer o navegador 
    // recarregar a lista de sugestões do datalist.
    input.blur();
    input.focus();
}

function showStatus(type, message) {
    const icon = document.getElementById('statusIcon');
    const msg = document.getElementById('statusMessage');
    const container = document.getElementById('statusContainer');
    
    container.className = '';
    icon.className = 'fas'; 
    msg.textContent = message;

    switch (type) {
        case 'loading':
            container.classList.add('loading');
            icon.classList.add('fa-spinner');
            break;
        case 'success':
            container.classList.add('success');
            icon.classList.add('fa-check-circle');
            break;
        case 'error':
            container.classList.add('error');
            icon.classList.add('fa-exclamation-triangle');
            break;
        case 'init':
            icon.className = '';
            msg.textContent = 'Aguardando inicialização...';
            break;
    }
}


// --------------------------------------------------------------------------
// Lógica de Filtro e Desenho
// --------------------------------------------------------------------------

function filterChart() {
    const startTimeStr = document.getElementById('startTime').value;
    const endTimeStr = document.getElementById('endTime').value;
    const hostFilter = document.getElementById('hostnameInput').value;

    if (!allData || allData.length === 0) return;

    const filtered = allData.filter(row => {
        const ts = row.Timestamp;
        
        // CORREÇÃO DE VALIDAÇÃO: isDateValid faz o trabalho
        if (!isDateValid(ts)) return false; 
        
        const hhmm = ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
        const hostOk = (hostFilter === 'all' || row.Hostname === hostFilter);
        const timeOk = (hhmm >= startTimeStr && hhmm <= endTimeStr);
        return hostOk && timeOk;
    });

    currentDataToDisplay = filtered;
    document.getElementById('event-details').style.display = 'none';
    drawAllCharts(filtered);
}

function destroyAllCharts() {
    if (chartInstanceMeet) chartInstanceMeet.destroy();
    if (chartInstanceMaquina) chartInstanceMaquina.destroy();
    if (chartInstanceVelocidade) chartInstanceVelocidade.destroy(); 
    if (chartInstanceTracert) chartInstanceTracert.destroy();
     
    chartInstanceMeet = null;
    chartInstanceMaquina = null;
    chartInstanceVelocidade = null;
    chartInstanceTracert = null;
}

function updateChartTheme() {
    drawAllCharts(currentDataToDisplay);
}

function drawAllCharts(dataToDisplay) {
    destroyAllCharts(); 
     
    if (!dataToDisplay || dataToDisplay.length === 0) {
        document.getElementById('statusMessage').textContent = "Nenhum dado encontrado no intervalo/hostname.";
        return;
    }
    const isDark = document.body.classList.contains('dark-mode');
    
    drawMaquinaChart(dataToDisplay, isDark);
    drawVelocidadeChart(dataToDisplay, isDark);
    drawMeetCharts(dataToDisplay, isDark);
    drawTracertChart(dataToDisplay[dataToDisplay.length - 1], isDark);
}

// -----------------------------------
// FUNÇÕES DE DESENHO DE GRÁFICOS (Chart.js)
// -----------------------------------

function getChartContext(canvasId) {
    const canvas = document.getElementById(canvasId);
    return canvas ? canvas.getContext('2d') : null;
}

// -------------------------------------------------------------
// GRÁFICO 1: CARGA DETALHADA DO COMPUTADOR (MAX: 100 FIXO)
// -------------------------------------------------------------
function drawMaquinaChart(rows, isDark) {
    const labels = rows.map(r => (r.Timestamp && !isNaN(r.Timestamp)) 
      ? r.Timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : ''
    );
    const dataCPU = rows.map(r => r.Uso_CPU);
    const dataRAM = rows.map(r => r.Uso_RAM);
    const dataDisco = rows.map(r => r.Uso_Disco);
    const dataCarga = rows.map(r => r.Carga_Computador); 
    
    const color = isDark ? '#f0f0f0' : '#333';
    const grid = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    const maxUsage = 100; // FIXO em 100.

    const ctx = getChartContext('maquinaChartCanvas');
    if (!ctx) return;

    chartInstanceMaquina = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Uso de CPU (%)', data: dataCPU, borderColor: '#F44336', backgroundColor:'rgba(244,67,54,.1)', tension:.3, fill:true, order:1 },
                { label: 'Uso de RAM (%)', data: dataRAM, borderColor:'#2196F3', backgroundColor:'rgba(33,150,243,.1)', tension:.3, fill:false, order:2 },
                { label: 'Uso de Disco (%)', data: dataDisco, borderColor:'#FFC107', backgroundColor:'rgba(255,193,7,.1)', tension:.3, fill:false, order:3 },
                { label: 'Carga Média (Score)', data: dataCarga, borderColor:'#795548', backgroundColor:'rgba(121,85,72,.1)', tension:.3, fill:false, order:4, borderDash:[5,5] }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, color: color,
            scales: {
                x: { title: { display:true, text:'Horário (HH:MM)', color }, grid:{ color: grid }, ticks:{ color } },
                y: { min:0, max: maxUsage, title:{ display:true, text:'Uso (%) / Carga (0-100)', color }, grid:{ color: grid }, ticks:{ color } }
            },
            plugins: { title: { display:true, text:'1. Carga Detalhada do Computador', color }, legend:{ labels:{ color } } }
        }
    });
}

// -------------------------------------------------------------
// GRÁFICO 2: TESTE DE VELOCIDADE (Download, Upload, Latência)
// -------------------------------------------------------------
function drawVelocidadeChart(rows, isDark) {
    const labels = rows.map(r => (r.Timestamp && !isNaN(r.Timestamp)) 
      ? r.Timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : ''
    );
    const dataDownload = rows.map(r => r.DownloadMbps);
    const dataUpload = rows.map(r => r.UploadMbps);
    const dataLatency = rows.map(r => r.Latencia_Speedtestms);

    const color = isDark ? '#f0f0f0' : '#333';
    const grid = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    const maxMbps = d3.max([...dataDownload, ...dataUpload]) || 50;
    const mbpsMax = Math.max(100, Math.ceil(maxMbps / 100) * 100);
    const maxLatency = d3.max(dataLatency) || 50;
    const latMax = Math.max(50, Math.ceil(maxLatency / 50) * 50);

    const ctx = getChartContext('velocidadeChartCanvas');
    if (!ctx) return;

    chartInstanceVelocidade = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Download (Mbps)', data: dataDownload, yAxisID:'y-mbps', borderColor:'#4CAF50', backgroundColor:'rgba(76,175,80,.1)', tension:.3, fill:false, order:1, pointRadius:4 },
                { label: 'Upload (Mbps)', data: dataUpload, yAxisID:'y-mbps', borderColor:'#FF9800', backgroundColor:'rgba(255,193,7,.1)', tension:.3, fill:false, order:2, pointRadius:4 },
                { label: 'Latência (ms)', data: dataLatency, yAxisID:'y-latency', borderColor:'#795548', backgroundColor:'rgba(121,85,72,.1)', tension:.3, fill:false, order:3, borderDash:[5,5], pointRadius:3 }
            ]
        },
        options: {
            responsive:true, maintainAspectRatio:false, color: color,
            scales: {
                x: { title:{ display:true, text:'Horário (HH:MM)', color }, grid:{ color: grid }, ticks:{ color } },
                'y-mbps': { type:'linear', position:'left', min:0, max: mbpsMax, title:{ display:true, text:'Velocidade (Mbps)', color }, grid:{ color: grid }, ticks:{ color } },
                'y-latency':{ type:'linear', position:'right', min:0, max: latMax, title:{ display:true, text:'Latência (ms)', color:'#795548' }, grid:{ drawOnChartArea:false, color: grid }, ticks:{ color:'#795548' } }
            },
            plugins: { title:{ display:true, text:'2. Teste de Velocidade da Internet', color }, legend:{ labels:{ color } } }
        }
    });
}

// -------------------------------------------------------------
// GRÁFICO 3: QUALIDADE DO MEET (SCORE MAX: 100 FIXO)
// -------------------------------------------------------------
function drawMeetCharts(rows, isDark) {
    const labels = rows.map(r => (r.Timestamp && !isNaN(r.Timestamp)) 
      ? r.Timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false })
      : ''
    );
    const dataScore = rows.map(r => r.Saude_Meet0100);
    const dataJitter = rows.map(r => r.Jitter_Meetms);
    const dataLatency = rows.map(r => r.Latencia_Meet_Media_ms);

    const color = isDark ? '#f0f0f0' : '#333';
    const grid = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    const maxLatJitter = d3.max([...dataJitter, ...dataLatency]) || 10;
    const latMax = Math.max(50, Math.ceil(maxLatJitter / 25) * 25);

    const ctx = getChartContext('meetChartCanvas');
    if (!ctx) return;

    chartInstanceMeet = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label:'Saúde Geral (Score 0-100)', yAxisID:'y-score', data: dataScore, borderColor:'#4CAF50', backgroundColor:'rgba(76,175,80,.1)', tension:.3, pointRadius:5, fill:true, order:1 },
                { label:'Jitter (ms)', yAxisID:'y-latency', data: dataJitter, borderColor:'#FFC107', backgroundColor:'rgba(255,193,7,.1)', tension:.3, pointRadius:3, fill:false, order:2 },
                { label:'Latência Média (ms)', yAxisID:'y-latency', data: dataLatency, borderColor:'#2196F3', backgroundColor:'rgba(33,150,243,.1)', tension:.3, pointRadius:3, fill:false, borderDash:[5,5], order:3 }
            ]
        },
        options: {
            responsive:true, maintainAspectRatio:false, color: color,
            interaction:{ mode:'index', intersect:false },
            onClick: handleChartClick,
            scales: {
                x: { title:{ display:true, text:'Horário (HH:MM)', color }, grid:{ color: grid }, ticks:{ color } },
                'y-score': { type:'linear', position:'left', min:0, max:100, title:{ display:true, text:'Saúde Meet (Score)', color }, grid:{ color: grid }, ticks:{ color, stepSize:25 } },
                'y-latency': { type:'linear', position:'right', min:0, max: latMax, title:{ display:true, text:'Latência / Jitter (ms)', color }, grid:{ drawOnChartArea:false, color: grid }, ticks:{ color } }
            },
            plugins:{ title:{ display:true, text:'3. Teste de Qualidade do Meet (Saúde, Latência, Jitter)', color }, legend:{ labels:{ color } } }
        }
    });
}

// -------------------------------------------------------------
// GRÁFICO 4: TRACERT (Rota por Salto)
// -------------------------------------------------------------
function drawTracertChart(lastRow, isDark) {
    if (!lastRow) return;

    const tracertData = [];
    for (let i = 1; i <= MAX_TTL; i++) {
        const ipKey  = `Hop_IP_${String(i).padStart(2, '0')}`;
        const latKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;
        const ip = (lastRow[ipKey] ?? '').replace(' [DESTINO]', '');
        const lat = lastRow[latKey];
        if (lat === 0 || ip === '' || ip === 'N/A') continue; 
        tracertData.push({ hop: i, ip, latency: lat });
    }

    if (tracertData.length === 0) {
        document.getElementById('chart-tracert').innerHTML = '<h3><i class="fas fa-route"></i> 4. Tracert do Meet (Rota por Salto)</h3><p>Nenhum dado de rota (Tracert) válido para plotagem.</p>';
        return;
    }

    const labels = tracertData.map(d => `Hop ${d.hop}`);
    const dataLat = tracertData.map(d => d.latency);
    const dataIps = tracertData.map(d => d.ip);
    const last = dataIps.length - 1; // Para destacar o último hop

    const maxLat = d3.max(dataLat) || 50;
    const yMax = Math.max(50, Math.ceil(maxLat / 50) * 50);

    const ctx = getChartContext('tracertChartCanvas');
    if (!ctx) return;

    chartInstanceTracert = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Latência por Salto (ms)',
                data: dataLat,
                backgroundColor: dataIps.map((_, i) => i === last ? '#00796B' : '#FF5722'),
                borderColor:     dataIps.map((_, i) => i === last ? '#00796B' : '#FF5722'),
                borderWidth: 1
            }]
        },
        options: {
            responsive:true, maintainAspectRatio:false, color: isDark ? '#f0f0f0' : '#333',
            scales: {
                x: {
                    grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
                    ticks: {
                        color: isDark ? '#f0f0f0' : '#333',
                        callback: (val, idx) => `${labels[idx]}\n(${dataIps[idx]})`
                    }
                },
                y: {
                    min: 0, max: yMax,
                    title: { display:true, text:'Latência (ms)', color: isDark ? '#f0f0f0' : '#333' },
                    grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
                    ticks: { color: isDark ? '#f0f0f0' : '#333' }
                }
            },
            plugins: {
                title: { display:true, text:'4. Rota do Tracert', color: isDark ? '#f0f0f0' : '#333' },
                legend: { display:false }
            }
        }
    });
}

// ========= Interações e Inicialização =========
function handleChartClick(event) {
    const chart = Chart.getChart('meetChartCanvas');
    if (!chart) return;
    const points = chart.getElementsAtEventForMode(event, 'index', { intersect: true }, false);
    if (points.length === 0) {
        document.getElementById('event-details').style.display = 'none';
        return;
    }
    const idx = points[0].index;
    const row = currentDataToDisplay[idx];
    if (row) displayEventDetails(row);
}

function displayEventDetails(dataRow) {
    const details = document.getElementById('event-details');
    const content = document.getElementById('event-content');

    const primary = [
        { label: 'Timestamp', key: 'Timestamp', format: d => d.toLocaleString('pt-BR') },
        { label: 'Hostname', key: 'Hostname' },
        { label: 'Localização', key: 'Cidade' },
        { label: 'IP Público', key: 'IP_Publico' },
        { label: 'Provedor', key: 'Provedor' },
        { label: 'Download (Mbps)', key: 'DownloadMbps', format: d => `${(+d).toFixed(2)}` },
        { label: 'Carga do PC (%)', key: 'Carga_Computador', format: d => `${dataRow.Carga_Computador}%` }, // Corrigido para usar o valor numérico
        { label: 'Saúde Meet (0-100)', key: 'Saude_Meet0100' },
        { label: 'Jitter (ms)', key: 'Jitter_Meetms', format: d => `${(+d).toFixed(2)}` },
        { label: 'Perda (%)', key: 'Perda_Meet', format: d => `${(+d).toFixed(1)}` }
    ];

    let html = '';
    primary.forEach(f => {
        const val = dataRow[f.key];
        const out = (f.format ? f.format(val) : (val ?? 'N/A'));
        html += `<p><strong>${f.label}:</strong> ${out}</p>`;
    });

    html += `<h4 style="margin-top:15px; border-bottom:1px solid #ccc; padding-bottom:5px;">Detalhes do Rastreamento de Rota</h4>`;
    let found = false;
    for (let i = 1; i <= MAX_TTL; i++) {
        const ipKey = `Hop_IP_${String(i).padStart(2, '0')}`;
        const ltKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;
        const ip = dataRow[ipKey];
        const lt = dataRow[ltKey];
        if (ip && ip.trim() !== '' && ip.trim() !== 'N/A') {
            const ltText = (lt > 0) ? `${(+lt).toFixed(2)} ms` : 'Perda/Timeout';
            html += `<p style="margin:5px 0;"><strong>Hop ${i}:</strong> ${ip} (${ltText})</p>`;
            found = true;
        }
    }
    if (!found) {
        html += `<p style="color:#999;">Nenhum dado de rastreamento de rota encontrado neste registro.</p>`;
    }

    content.innerHTML = html;
    details.style.display = 'block';
}

// ========= Boot =========
document.addEventListener('DOMContentLoaded', () => {
    
    // Checagem de libs
    if (typeof Papa === 'undefined') {
        document.getElementById('statusMessage').textContent = 'ERRO: PapaParse (CSV Reader) não está carregado. Verifique seu index.html.';
        return;
    }
    if (typeof Chart === 'undefined') {
        document.getElementById('statusMessage').textContent = 'AVISO: Chart.js não carregado. Gráficos desabilitados.';
    }
    if (typeof d3 === 'undefined') {
        console.warn('AVISO: d3.js não carregado. O cálculo automático dos eixos pode não ser ideal.');
    }


    applySavedTheme();

    document.getElementById('dateSelect').value = getCurrentDateFormatted();

    // Eventos 
    document.getElementById('btnBuscar').addEventListener('click', initMonitor);
    document.getElementById('dateSelect').addEventListener('change', initMonitor);
    document.getElementById('applyFiltersButton').addEventListener('click', filterChart);
    document.getElementById('hostnameInput').addEventListener('change', filterChart); 
    
    // inicialização
    initMonitor();
    startAutoUpdate();
});
