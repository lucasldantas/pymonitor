// VARIÁVEIS GLOBAIS
let allData = [];
let currentDataToDisplay = []; 
const AUTO_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutos em milissegundos
let autoUpdateTimer = null; 
const BASE_CSV_URL = './'; // Caminho relativo para o GitHub Pages
const MAX_TTL = 30; // Limite fixo de hops para o CSV

// --------------------------------------------------------------------------
// Funções Auxiliares
// --------------------------------------------------------------------------

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

function typeConverter(row) {
    if (!row.Timestamp) return null; 

    const newRow = {};
    for (const key in row) {
        const cleanKey = key.replace(/[\(\)%]/g, '').replace(/ /g, '_').replace('.', ''); 
        newRow[cleanKey] = row[key];
    }
    
    newRow.Timestamp = new Date(newRow.Timestamp);
    
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

    for (let i = 1; i <= MAX_TTL; i++) {
        const latKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;
        newRow[latKey] = parseFloat(newRow[latKey]) || 0;
    }
    
    return newRow;
}


// --------------------------------------------------------------------------
// Lógica de Tema e Inicialização
// --------------------------------------------------------------------------

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark);
    drawAllCharts(currentDataToDisplay); // Redesenha para aplicar o tema
}

function applySavedTheme() {
    const savedTheme = localStorage.getItem('darkMode');
    const checkbox = document.getElementById('checkbox');
    
    if (savedTheme === 'true') {
        document.body.classList.add('dark-mode');
        checkbox.checked = true;
    }
    
    checkbox.addEventListener('change', toggleDarkMode);
}

function startAutoUpdate() {
    if (autoUpdateTimer) {
        clearInterval(autoUpdateTimer);
    }
    
    autoUpdateTimer = setInterval(() => {
        console.log(`Autoatualizando dados...`);
        initMonitor(); 
    }, AUTO_UPDATE_INTERVAL);
}

// --------------------------------------------------------------------------
// Lógica de Carregamento (ESTÁVEL)
// --------------------------------------------------------------------------

function initMonitor() {
    applySavedTheme(); 
    
    const statusElement = document.getElementById('statusMessage');
    const fileName = getFileName();
    const fullURL = BASE_CSV_URL + fileName;

    statusElement.textContent = `Carregando: ${fileName}...`;
    allData = []; 

    document.getElementById('startTime').value = "00:00";
    document.getElementById('endTime').value = "23:59";
    document.getElementById('event-details').style.display = 'none';

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

        complete: function(results) {
            
            allData = results.data.map(typeConverter).filter(row => row !== null); 

            if (allData.length === 0) {
                statusElement.textContent = `Erro: Nenhuma linha de dados válida em ${fileName} ou arquivo vazio.`;
                // Não precisa destruir, apenas atualizar com dados vazios
                drawAllCharts([]); 
                return;
            }
            
            statusElement.textContent = `Sucesso! Carregado ${allData.length} registros de ${fileName}.`;

            populateHostnames(allData); 
            filterChart(); 
        },
        error: function(error) {
            console.error("Erro ao carregar o CSV:", error);
            statusElement.textContent = `ERRO: Não foi possível carregar o arquivo ${fileName}. Verifique o nome/data.`;
            drawAllCharts([]);
        }
    });
}

function populateHostnames(data) {
    const hostnames = [...new Set(data.map(d => d.Hostname))];
    const select = document.getElementById('hostnameFilter');
    const selectedValue = select.value;

    select.innerHTML = '<option value="all">Todas as Máquinas</option>';
    hostnames.forEach(host => {
        const option = document.createElement('option');
        option.value = host;
        option.textContent = host;
        select.appendChild(option);
    });

    if (hostnames.includes(selectedValue)) {
         select.value = selectedValue;
    }
}


// --------------------------------------------------------------------------
// Lógica de Filtro e Desenho Central (AGORA CHAMA A FUNÇÃO DE DESTRUIÇÃO/ATUALIZAÇÃO)
// --------------------------------------------------------------------------

function filterChart() {
    const startTimeStr = document.getElementById('startTime').value;
    const endTimeStr = document.getElementById('endTime').value;
    const hostnameFilter = document.getElementById('hostnameFilter').value;

    if (!allData || allData.length === 0) { 
        currentDataToDisplay = [];
        drawAllCharts([]);
        return; 
    }

    const filteredData = allData.filter(row => {
        const timestamp = row.Timestamp;
        if (!(timestamp instanceof Date)) return false;
        
        const timeOnly = timestamp.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit', hour12: false});
        
        const matchesHostname = hostnameFilter === 'all' || row.Hostname === hostnameFilter; 
        
        const isWithinTime = timeOnly >= startTimeStr && timeOnly <= endTimeStr;

        return isWithinTime && matchesHostname;
    });

    currentDataToDisplay = filteredData;
    document.getElementById('event-details').style.display = 'none';

    drawAllCharts(filteredData);
}

function drawAllCharts(dataToDisplay) {
    
    if (dataToDisplay.length === 0) {
        document.getElementById('statusMessage').textContent = "Nenhum dado encontrado no intervalo ou Hostname selecionado.";
        // Atualiza com dados vazios para limpar a tela
        dataToDisplay = [{}]; 
    } else {
        document.getElementById('statusMessage').textContent = `Sucesso! Exibindo ${dataToDisplay.length} registros.`;
    }

    const isDark = document.body.classList.contains('dark-mode');
    
    // ORDEM SOLICITADA:
    drawMaquinaChart(dataToDisplay, isDark);
    drawVelocidadeChart(dataToDisplay, isDark);
    drawMeetCharts(dataToDisplay, isDark);
    drawTracertChart(dataToDisplay[dataToDisplay.length - 1], isDark);
}

// -----------------------------------
// FUNÇÕES DE DESENHO DE GRÁFICOS (USANDO Chart.getChart e ATUALIZAÇÃO)
// -----------------------------------

// Função auxiliar para obter ou criar o contexto do canvas (SOLUÇÃO ESTÁVEL)
function getOrCreateChartContext(canvasId) {
    const existingChart = Chart.getChart(canvasId);
    if (existingChart) {
        existingChart.destroy(); // Destrói explicitamente antes de retornar o contexto
    }
    const canvas = document.getElementById(canvasId);
    return canvas ? canvas.getContext('2d') : null;
}


// --- GRÁFICO 1: CARGA ---
function drawMaquinaChart(dataToDisplay, isDark) {
    const labels = dataToDisplay.map(row => row.Timestamp ? row.Timestamp.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '');
    const dataCPU = dataToDisplay.map(row => row.Uso_CPU);
    const dataRAM = dataToDisplay.map(row => row.Uso_RAM);
    const dataDisco = dataToDisplay.map(row => row.Uso_Disco);
    const dataCargaMedia = dataToDisplay.map(row => row.Carga_Computador);
    
    const color = isDark ? '#f0f0f0' : '#333';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    
    const allUsage = dataCPU.concat(dataRAM).concat(dataDisco).concat(dataCargaMedia).filter(v => v > 0);
    const maxUsage = d3.max(allUsage) || 10; 
    const usageMaxScale = Math.max(50, Math.ceil(maxUsage / 10) * 10); 
    
    const ctxMaquina = getOrCreateChartContext('maquinaChartCanvas');
    if (!ctxMaquina) return;
    
    chartInstanceMaquina = new Chart(ctxMaquina, {
        type: 'line', 
        data: {
            labels: labels,
            datasets: [ /* ... (datasets de CPU, RAM, Disco, Média) ... */
                {label: 'Uso de CPU (%)', data: dataCPU, borderColor: '#F44336', backgroundColor: 'rgba(244, 67, 54, 0.1)', tension: 0.3, fill: true, order: 1, hidden: false},
                {label: 'Uso de RAM (%)', data: dataRAM, borderColor: '#2196F3', backgroundColor: 'rgba(33, 150, 243, 0.1)', tension: 0.3, fill: false, order: 2},
                {label: 'Uso de Disco (%)', data: dataDisco, borderColor: '#FFC107', backgroundColor: 'rgba(255, 193, 7, 0.1)', tension: 0.3, fill: false, order: 3},
                {label: 'Carga Média (Score)', data: dataCargaMedia, borderColor: '#795548', backgroundColor: 'rgba(121, 85, 72, 0.1)', tension: 0.3, fill: false, order: 4, borderDash: [5, 5]}
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, color: color, 
            scales: {
                x: { title: { display: true, text: 'Horário (HH:MM)', color: color }, grid: { color: gridColor }, ticks: { color: color } },
                y: { min: 0, max: usageMaxScale, title: { display: true, text: 'Uso (%) / Carga (0-100)', color: color }, grid: { color: gridColor }, ticks: { color: color } }
            },
            plugins: { title: { display: true, text: `1. Carga Detalhada do Computador`, color: color }, legend: { labels: { color: color } } }
        }
    });
}

// --- GRÁFICO 2: VELOCIDADE ---
function drawVelocidadeChart(dataToDisplay, isDark) {
    const labels = dataToDisplay.map(row => row.Timestamp ? row.Timestamp.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '');
    const dataDownload = dataToDisplay.map(row => row.DownloadMbps);
    const dataUpload = dataToDisplay.map(row => row.UploadMbps);
    const dataLatency = dataToDisplay.map(row => row.Latencia_Speedtestms);
    
    const color = isDark ? '#f0f0f0' : '#333';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    
    let maxMbps = d3.max(dataDownload.concat(dataUpload)) || 50; 
    const mbpsMaxScale = Math.max(100, Math.ceil(maxMbps / 100) * 100); 

    let maxLatency = d3.max(dataLatency) || 50;
    const latencyMaxScale = Math.max(50, Math.ceil(maxLatency / 50) * 50);

    const ctxVelocidade = getOrCreateChartContext('velocidadeChartCanvas');
    if (!ctxVelocidade) return;
    
    chartInstanceVelocidade = new Chart(ctxVelocidade, {
        type: 'line', 
        data: {
            labels: labels,
            datasets: [ /* ... (datasets de Download, Upload, Latência) ... */
                {label: 'Download (Mbps)', data: dataDownload, yAxisID: 'y-mbps', borderColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.1)', tension: 0.3, fill: false, order: 1, pointRadius: 4},
                {label: 'Upload (Mbps)', data: dataUpload, yAxisID: 'y-mbps', borderColor: '#FF9800', backgroundColor: 'rgba(255, 152, 0, 0.1)', tension: 0.3, fill: false, order: 2, pointRadius: 4},
                {label: 'Latência (ms)', data: dataLatency, yAxisID: 'y-latency', borderColor: '#795548', backgroundColor: 'rgba(121, 85, 72, 0.1)', tension: 0.3, fill: false, order: 3, borderDash: [5, 5], pointRadius: 3}
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, color: color, 
            scales: {
                x: { title: { display: true, text: 'Horário (HH:MM)', color: color }, grid: { color: gridColor }, ticks: { color: color } },
                'y-mbps': { 
                    type: 'linear', position: 'left', min: 0, max: mbpsMaxScale, 
                    title: { display: true, text: 'Velocidade (Mbps)', color: color },
                    grid: { color: gridColor }, ticks: { color: color }
                },
                'y-latency': { 
                    type: 'linear', position: 'right', min: 0, max: latencyMaxScale, 
                    title: { display: true, text: 'Latência (ms)', color: '#795548' },
                    grid: { drawOnChartArea: false, color: gridColor }, ticks: { color: '#795548' }
                }
            },
            plugins: { title: { display: true, text: `2. Teste de Velocidade da Internet`, color: color }, legend: { labels: { color: color } } }
        }
    });
}

// --- GRÁFICO 3: QUALIDADE MEET ---
function drawMeetCharts(dataToDisplay, isDark) {
    const labels = dataToDisplay.map(row => row.Timestamp ? row.Timestamp.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : '');
    const dataScores = dataToDisplay.map(row => row.Saude_Meet0100);
    const dataJitter = dataToDisplay.map(row => row.Jitter_Meetms); 
    const dataLatency = dataToDisplay.map(row => row.Latencia_Meet_Mediaps);
    
    const color = isDark ? '#f0f0f0' : '#333';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    
    let maxLatJitter = d3.max(dataJitter.concat(dataLatency)) || 10;
    const latencyMaxScale = Math.max(50, Math.ceil(maxLatJitter / 25) * 25); 

    const ctxMeet = getOrCreateChartContext('meetChartCanvas');
    if (!ctxMeet) return;
    
    chartInstanceMeet = new Chart(ctxMeet, {
        type: 'line', 
        data: {
            labels: labels,
            datasets: [ /* ... (datasets de Saúde, Jitter, Latência) ... */
                {label: 'Saúde Geral (Score 0-100)', yAxisID: 'y-score', data: dataScores, borderColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.1)', tension: 0.3, pointRadius: 5, fill: true, order: 1},
                {label: 'Jitter (Variação da Latência)', yAxisID: 'y-latency', data: dataJitter, borderColor: '#FFC107', backgroundColor: 'rgba(255, 193, 7, 0.1)', tension: 0.3, pointRadius: 3, fill: false, order: 2},
                {label: 'Latência Média', yAxisID: 'y-latency', data: dataLatency, borderColor: '#2196F3', backgroundColor: 'rgba(33, 150, 243, 0.1)', tension: 0.3, pointRadius: 3, fill: false, borderDash: [5, 5], order: 3}
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, color: color, 
            interaction: { mode: 'index', intersect: false },
            onClick: handleChartClick,
            scales: {
                x: { title: { display: true, text: 'Horário (HH:MM)', color: color }, grid: { color: gridColor }, ticks: { color: color } },
                'y-score': { 
                    type: 'linear', position: 'left', min: 0, max: 100, 
                    title: { display: true, text: 'Saúde Meet (Score)', color: color },
                    grid: { color: gridColor }, ticks: { color: color, stepSize: 25 }
                },
                'y-latency': { 
                    type: 'linear', position: 'right', min: 0, max: latencyMaxScale, 
                    title: { display: true, text: 'Latência / Jitter (ms)', color: color },
                    grid: { drawOnChartArea: false, color: gridColor },
                    ticks: { color: color }
                }
            },
            plugins: { title: { display: true, text: `3. Teste de Qualidade do Meet (Saúde, Latência, Jitter)`, color: color }, legend: { labels: { color: color } } }
        }
    });
}

// --- GRÁFICO 4: TRACERT ---
function drawTracertChart(lastRecord, isDark) {
    if (!lastRecord || !lastRecord.Timestamp) {
         document.getElementById('chart-tracert').innerHTML = '<h3><i class="fas fa-route"></i> 4. Tracert do Meet (Rota por Salto)</h3><p>Nenhum dado de rota (Tracert) válido para plotagem.</p>';
         return;
    }
    
    const tracertData = [];

    for (let i = 1; i <= MAX_TTL; i++) {
        const ipKey = `Hop_IP_${String(i).padStart(2, '0')}`;
        const latKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;
        
        const ip = lastRecord[ipKey];
        const lat = lastRecord[latKey];

        if (lat === 0 || ip === "") continue; 

        tracertData.push({
            hop: i,
            ip: ip.replace(' [DESTINO]', ''),
            latency: lat
        });
    }
    
    if (tracertData.length === 0) {
        document.getElementById('chart-tracert').innerHTML = '<h3><i class="fas fa-route"></i> 4. Tracert do Meet (Rota por Salto)</h3><p>Nenhum dado de rota (Tracert) válido para plotagem.</p>';
        return;
    }

    const labels = tracertData.map(d => `Hop ${d.hop}`);
    const dataLatencies = tracertData.map(d => d.latency);
    const dataIps = tracertData.map(d => d.ip);
    
    const maxLatTracert = d3.max(dataLatencies) || 50;
    const tracertMaxScale = Math.max(50, Math.ceil(maxLatTracert / 50) * 50);

    const ctxTracert = getOrCreateChartContext('tracertChartCanvas');
    if (!ctxTracert) return;

    chartInstanceTracert = new Chart(ctxTracert, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Latência por Salto (ms)',
                data: dataLatencies,
                backgroundColor: dataIps.map(ip => ip.includes('DESTINO') ? '#00796B' : '#FF5722'),
                borderColor: dataIps.map(ip => ip.includes('DESTINO') ? '#00796B' : '#FF5722'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, color: isDark ? '#f0f0f0' : '#333',
            scales: {
                x: { 
                    grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }, 
                    ticks: { color: isDark ? '#f0f0f0' : '#333', callback: (val, index) => `${labels[index]}\n(${dataIps[index]})` } 
                },
                y: { 
                    title: { display: true, text: 'Latência (ms)', color: isDark ? '#f0f0f0' : '#333' }, 
                    grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }, 
                    max: tracertMaxScale, 
                    min: 0,
                    ticks: { color: isDark ? '#f0f0f0' : '#333' } 
                }
            },
            plugins: { 
                title: { display: true, text: `4. Rota do Tracert`, color: isDark ? '#f0f0f0' : '#333' }, 
                legend: { display: false } 
            }
        }
    });
}

function handleChartClick(event) {
    if (typeof Chart === 'undefined') return; 
    
    const points = Chart.getChart('meetChartCanvas').getElementsAtEventForMode(event, 'index', { intersect: true }, false);

    if (points.length === 0) {
        document.getElementById('event-details').style.display = 'none';
        return;
    }

    const dataIndex = points[0].index;
    const clickedRow = currentDataToDisplay[dataIndex];

    if (clickedRow) {
        displayEventDetails(clickedRow);
    }
}


function displayEventDetails(dataRow) {
    const detailsContainer = document.getElementById('event-details');
    const content = document.getElementById('event-content');

    const primaryFields = [
        { label: "Timestamp", key: "Timestamp", format: d => d.toLocaleString('pt-BR') },
        { label: "Hostname", key: "Hostname" },
        { label: "Localização", key: "Cidade" },
        { label: "IP Público", key: "IP_Publico" },
        { label: "Provedor", key: "Provedor" },
        { label: "Download (Mbps)", key: "DownloadMbps", format: d => `${d.toFixed(2)}` },
        { label: "Carga do PC (%)", key: "Carga_Computador" },
        { label: "Saúde Meet (0-100)", key: "Saude_Meet0100" },
        { label: "Jitter (ms)", key: "Jitter_Meetms", format: d => `${d.toFixed(2)}` },
        { label: "Perda (%)", key: "Perda_Meet", format: d => `${d.toFixed(1)}` },
    ];

    let html = '';
    
    primaryFields.forEach(field => {
        const value = dataRow[field.key];
        const displayValue = field.format ? field.format(value) : value || 'N/A';
        html += `<p><strong>${field.label}:</strong> ${displayValue}</p>`;
    });

    html += `<h4 style="margin-top: 15px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Detalhes do Rastreamento de Rota</h4>`;

    let foundHops = false;
    for (let i = 1; i <= 30; i++) {
        const ipKey = `Hop_IP_${String(i).padStart(2, '0')}`;
        const latencyKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;

        const ip = dataRow[ipKey];
        const latency = dataRow[latencyKey];
        
        if (ip && ip.trim() !== '') {
            const latencyValue = latency > 0 ? `${latency.toFixed(2)} ms` : 'Perda/Timeout';
            html += `<p style="margin-top: 5px; margin-bottom: 5px;"><strong>Hop ${i}:</strong> ${ip} (${latencyValue})</p>`;
            foundHops = true;
        }
    }
    
    if (!foundHops) {
        html += `<p style="color: #999;">Nenhum dado de rastreamento de rota encontrado neste registro (requer execução com 'sudo').</p>`;
    }

    content.innerHTML = html;
    detailsContainer.style.display = 'block';
}


document.addEventListener('DOMContentLoaded', () => {
    
    if (typeof Papa === 'undefined') {
        document.getElementById('statusMessage').textContent = 'ERRO: PapaParse (CSV Reader) não está carregado. Verifique seu index.html.';
        return;
    }
    
    if (typeof Chart === 'undefined') {
         document.getElementById('statusMessage').textContent = 'AVISO: Chart.js não carregado. Gráficos desabilitados.';
    }
    
    applySavedTheme(); 
    
    document.getElementById('dateSelect').value = getCurrentDateFormatted();
    
    document.getElementById('dateSelect').addEventListener('change', initMonitor);
    document.getElementById('applyFiltersButton').addEventListener('click', filterChart);
    document.getElementById('hostnameFilter').addEventListener('change', filterChart); 
    
    initMonitor(); 
    startAutoUpdate();
});
