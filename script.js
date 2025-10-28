// ========= Config =========
const AUTO_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutos em milissegundos
const BASE_CSV_URL = './'; // caminho relativo (ex.: GitHub Pages)
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

// Normaliza nomes de colunas e tipos
function typeConverter(row) {
    if (!row.Timestamp) return null; 

    const newRow = {};
    for (const key in row) {
        const cleanKey = key.replace(/[\(\)%]/g, '').replace(/ /g, '_').replace('.', ''); 
        newRow[cleanKey] = row[key];
    }
    
    newRow.Timestamp = new Date(newRow.Timestamp);
    
    // Tipos e Conversão de Nome
    newRow.Uso_CPU = parseFloat(newRow.Uso_CPU) || 0;
    newRow.Uso_RAM = parseFloat(newRow.Uso_RAM) || 0;
    newRow.Uso_Disco = parseFloat(newRow.Uso_Disco) || 0;
    newRow.Carga_Computador = parseInt(newRow.Carga_Computador) || 0;
    newRow.DownloadMbps = parseFloat(newRow.DownloadMbps) || 0;
    newRow.UploadMbps = parseFloat(newRow.UploadMbps) || 0;
    newRow.Latencia_Speedtestms = parseFloat(newRow.Latencia_Speedtestms) || 0;
    newRow.Saude_Meet0100 = parseInt(newRow.Saude_Meet0100) || 0;
    newRow.Latencia_Meet_Mediaps = parseFloat(newRow.Latencia_Meet_Media_ms) || 0; 
    newRow.Jitter_Meetms = parseFloat(newRow.Jitter_Meetms) || 0;
    newRow.Perda_Meet = parseFloat(newRow.Perda_Meet) || 0;

    // Hops
    for (let i = 1; i <= MAX_TTL; i++) {
        const latKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;
        const ipKey  = `Hop_IP_${String(i).padStart(2, '0')}`;
        newRow[latKey] = parseFloat(newRow[latKey]) || 0;
        newRow[ipKey] = (newRow[ipKey] ?? '').toString();
    }
    
    return newRow;
}

// ========= Tema =========
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

// ========= Auto Update =========
function startAutoUpdate() {
    if (autoUpdateTimer) clearInterval(autoUpdateTimer);
    autoUpdateTimer = setInterval(() => {
        console.log('Autoatualizando dados...');
        initMonitor();
    }, AUTO_UPDATE_INTERVAL);
}

// ========= Carregamento CSV =========
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

    Papa.parse(fullURL, {
        download: true, 
        header: true,   
        skipEmptyLines: true,
        worker: false, // Evita falhas de threading
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
                return;
            }
            
            showStatus('success', `Dados prontos.`);
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
    const hostnames = [...new Set(data.map(d => d.Hostname))].sort();
    const datalist = document.getElementById('hostnames');
    const input = document.getElementById('hostnameInput');
    
    const selectedValue = input.value;

    datalist.innerHTML = ''; // Limpa antes de preencher
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Todas as Máquinas';
    datalist.appendChild(allOption);

    hostnames.forEach(host => {
        const option = document.createElement('option');
        option.value = host;
        datalist.appendChild(option);
    });

    if (hostnames.includes(selectedValue) || selectedValue === 'all') {
         input.value = selectedValue;
    } else {
        input.value = 'all'; 
    }
}

// --------------------------------------------------------------------------
// Lógica de Status e Animação
// --------------------------------------------------------------------------

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
        if (!(ts instanceof Date) || isNaN(ts)) return false;

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
    // 1. Destrói as instâncias Chart.js existentes
    if (chartInstanceMeet) chartInstanceMeet.destroy();
    if (chartInstanceMaquina) chartInstanceMaquina.destroy();
    if (chartInstanceVelocidade) chartInstanceVelocidade.destroy(); 
    if (chartInstanceTracert) chartInstanceTracert.destroy();
    
    // 2. Zera as variáveis de instância (CRUCIAL para estabilidade)
    chartInstanceMeet = null;
    chartInstanceMaquina = null;
    chartInstanceVelocidade = null;
    chartInstanceTracert = null;
}

function updateChartTheme() {
    drawAllCharts(currentDataToDisplay);
}

function drawAllCharts(dataToDisplay) {
    destroyAllCharts(); // Limpeza crucial no início
    
    if (!dataToDisplay || dataToDisplay.length === 0) {
        document.getElementById('statusMessage').textContent = 'Nenhum dado encontrado no intervalo/hostname.';
        return;
    }
    const isDark = document.body.classList.contains('dark-mode');
    
    // ORDEM SOLICITADA:
    drawMaquinaChart(dataToDisplay, isDark);
    drawVelocidadeChart(dataToDisplay, isDark);
    drawMeetCharts(dataToDisplay, isDark);
    drawTracertChart(dataToDisplay[dataToDisplay.length - 1], isDark);
}

// ========= Helpers de Gráfico =========
function getChartContext(canvasId) {
    const canvas = document.getElementById(canvasId);
    return canvas ? canvas.getContext('2d') : null;
}

// -----------------------------------
// FUNÇÕES DE DESENHO DE GRÁFICOS (Chart.js)
// -----------------------------------

// -------------------------------------------------------------
// GRÁFICO 1: CARGA DETALHADA DO COMPUTADOR (MAX: 100 FIXO)
// -------------------------------------------------------------
function drawMaquinaChart(rows, isDark) {
    const labels = rows.map(r => r.Timestamp ? r.Timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
    const dataCPU = rows.map(r => r.Uso_CPU);
    const dataRAM = rows.map(r => r.Uso_RAM);
    const dataDisco = rows.map(r => r.Uso_Disco);
    const dataCarga = rows.map(r => r.Carga_Computador);

    const color = isDark ? '#f0f0f0' : '#333';
    const grid = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    const maxUsage = 100; // FIXO em 100, conforme solicitação.

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
                // MAX: 100 FIXO
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
    const labels = rows.map(r => r.Timestamp ? r.Timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
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
// GRÁFICO 3: QUALIDADE DO MEET (JÁ ESTAVA FIXO EM MAX: 100)
// -------------------------------------------------------------
function drawMeetCharts(rows, isDark) {
    const labels = rows.map(r => r.Timestamp ? r.Timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
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
                // Eixo Y-Score FIXO em 100
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
        const ipKey  = `Hop_IP_${String(i).padStart(2, '0')}`;
        const latKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;
        const ip = (lastRow[ipKey] ?? '').replace(' [DESTINO]', '');
        const lat = lastRow[latKey];
        if (lat === 0 || ip === '') continue;
        tracertData.push({ hop: i, ip, latency: lat });
    }

    if (tracertData.length === 0) {
        document.getElementById('chart-tracert').innerHTML = '<h3><i class="fas fa-route"></i> 4. Tracert do Meet (Rota por Salto)</h3><p>Nenhum dado de rota (Tracert) válido para plotagem.</p>';
        return;
    }

    const labels = tracertData.map(d => `Hop ${d.hop}`);
    const dataLat = tracertData.map(d => d.latency);
    const dataIps = tracertData.map(d => d.ip);

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
                backgroundColor: dataIps.map(ip => ip.includes('DESTINO') ? '#00796B' : '#FF5722'),
                borderColor: dataIps.map(ip => ip.includes('DESTINO') ? '#00796B' : '#FF5722'),
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
        { label: 'Carga do PC (%)', key: 'Carga_Computador', format: d => `${d}%` },
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
        if (ip && ip.trim() !== '') {
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
