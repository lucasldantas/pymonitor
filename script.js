// VARIÁVEIS GLOBAIS
let allData = [];
let chartInstanceMeet = null;
let chartInstanceMaquina = null;
let chartInstanceTracert = null;
let currentDataToDisplay = []; 
const AUTO_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutos em milissegundos
let autoUpdateTimer = null; 
const BASE_CSV_URL = './'; // Caminho relativo para o GitHub Pages
const MAX_TTL = 30; // Deve ser igual ao MAX_TTL do Python

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

// Converte strings do CSV em tipos corretos (Sanitiza chaves e valores)
function typeConverter(row) {
    if (!row.Timestamp) return null; 

    // 1. Sanitização de Chaves
    const newRow = {};
    for (const key in row) {
        // Remove caracteres que o PapaParse não lida bem (espaços, parênteses)
        const cleanKey = key.replace(/[\(\)%]/g, '').replace(/ /g, '_').replace('.', ''); 
        newRow[cleanKey] = row[key];
    }
    
    // 2. Conversão de Tipos
    newRow.Timestamp = new Date(newRow.Timestamp);
    
    // Conversões para float/int (usando || 0 para tratar N/A ou strings vazias)
    newRow.Uso_CPU = parseFloat(newRow.Uso_CPU) || 0;
    newRow.Uso_RAM = parseFloat(newRow.Uso_RAM) || 0;
    newRow.Uso_Disco = parseFloat(newRow.Uso_Disco) || 0;
    newRow.Carga_Computador = parseInt(newRow.Carga_Computador) || 0;
    newRow.DownloadMbps = parseFloat(newRow.DownloadMbps) || 0;
    newRow.UploadMbps = parseFloat(newRow.UploadMbps) || 0;
    newRow.Latencia_Speedtestms = parseFloat(newRow.Latencia_Speedtestms) || 0;
    newRow.Saude_Meet0100 = parseInt(newRow.Saude_Meet0100) || 0;
    // Usando a chave correta para Latência Média do Meet
    newRow.Latencia_Meet_Mediaps = parseFloat(newRow.Latencia_Meet_Media_ms) || 0; 
    newRow.Jitter_Meetms = parseFloat(newRow.Jitter_Meetms) || 0;
    newRow.Perda_Meet = parseFloat(newRow.Perda_Meet) || 0;

    // 3. Conversão de Dados de Tracert
    for (let i = 1; i <= MAX_TTL; i++) {
        const latKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;
        // Converte Latência para número. "" se torna 0.
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
    updateChartTheme(isDark);
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
// Lógica de Carregamento e PapaParse (CORREÇÃO DE INSTABILIDADE)
// --------------------------------------------------------------------------

function initMonitor() {
    const statusElement = document.getElementById('statusMessage');
    const fileName = getFileName();
    const fullURL = BASE_CSV_URL + fileName;

    statusElement.textContent = `Carregando: ${fileName}...`;
    allData = []; 
    currentDataToDisplay = [];

    document.getElementById('startTime').value = "00:00";
    document.getElementById('endTime').value = "23:59";
    document.getElementById('event-details').style.display = 'none';

    Papa.parse(fullURL, {
        download: true, 
        header: true,   
        skipEmptyLines: true,
        worker: false, // Desabilita worker para evitar falhas em caminhos relativos
        downloadRequestHeaders: {
            // Força a requisição a não usar cache (resolve o problema de travamento)
            'Cache-Control': 'no-cache', 
            'Pragma': 'no-cache',
            'If-Modified-Since': 'Sat, 01 Jan 2000 00:00:00 GMT'
        },

        complete: function(results) {
            
            allData = results.data.map(typeConverter).filter(row => row !== null); 

            if (allData.length === 0) {
                statusElement.textContent = `Erro: Nenhuma linha de dados válida em ${fileName} ou arquivo vazio.`;
                destroyAllCharts();
                return;
            }
            
            statusElement.textContent = `Sucesso! Carregado ${allData.length} registros de ${fileName}.`;

            populateHostnames(allData); 
            filterChart(); 
        },
        error: function(error) {
            console.error("Erro ao carregar o CSV:", error);
            statusElement.textContent = `ERRO: Não foi possível carregar o arquivo ${fileName}. Verifique o nome/data.`;
            destroyAllCharts();
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
// Lógica de Filtro e Desenho
// --------------------------------------------------------------------------

function filterChart() {
    const startTimeStr = document.getElementById('startTime').value;
    const endTimeStr = document.getElementById('endTime').value;
    const hostnameFilter = document.getElementById('hostnameFilter').value;

    if (!allData || allData.length === 0) { return; }

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

function destroyAllCharts() {
    if (chartInstanceMeet) chartInstanceMeet.destroy();
    if (chartInstanceMaquina) chartInstanceMaquina.destroy();
    if (chartInstanceTracert) chartInstanceTracert.destroy();
    // Recria os elementos canvas, corrigindo o erro 'Cannot set properties of null'
    document.getElementById('chart-saude-meet').innerHTML = '<canvas id="meetChartCanvas"></canvas>';
    document.getElementById('chart-saude-maquina').innerHTML = '<canvas id="maquinaChartCanvas"></canvas>';
    document.getElementById('chart-tracert').innerHTML = '<canvas id="tracertChartCanvas"></canvas>';
}

function updateChartTheme(isDark) {
    drawAllCharts(currentDataToDisplay);
}

function drawAllCharts(dataToDisplay) {
    destroyAllCharts(); 
    
    if (dataToDisplay.length === 0) {
        document.getElementById('statusMessage').textContent = "Nenhum dado encontrado no intervalo ou Hostname selecionado.";
        return;
    }

    const isDark = document.body.classList.contains('dark-mode');
    
    drawMeetCharts(dataToDisplay, isDark);
    drawMaquinaChart(dataToDisplay, isDark);
    drawTracertChart(dataToDisplay[dataToDisplay.length - 1], isDark);
}

// -----------------------------------
// FUNÇÕES DE DESENHO DE GRÁFICOS (Chart.js)
// -----------------------------------
function drawMeetCharts(dataToDisplay, isDark) {
    const labels = dataToDisplay.map(row => row.Timestamp.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}));
    const dataScores = dataToDisplay.map(row => row.Saude_Meet0100);
    const dataJitter = dataToDisplay.map(row => row.Jitter_Meetms); 
    const dataLatency = dataToDisplay.map(row => row.Latencia_Meet_Mediaps);
    
    const color = isDark ? '#f0f0f0' : '#333';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    
    let maxLatJitter = Math.max(d3.max(dataJitter) || 0, d3.max(dataLatency) || 0) * 1.2;
    const latencyMaxScale = Math.ceil((maxLatJitter + 10) / 50) * 50; 

    const ctxMeet = document.getElementById('meetChartCanvas').getContext('2d');
    chartInstanceMeet = new Chart(ctxMeet, {
        type: 'line', 
        data: {
            labels: labels,
            datasets: [{
                label: 'Saúde Geral (Score 0-100)',
                data: dataScores,
                yAxisID: 'y-score', borderColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.1)',
                tension: 0.3, pointRadius: 5, fill: true, order: 1
            },
            {
                label: 'Jitter (Variação da Latência)',
                data: dataJitter,
                yAxisID: 'y-latency', borderColor: '#FFC107', backgroundColor: 'rgba(255, 193, 7, 0.1)',
                tension: 0.3, pointRadius: 3, fill: false, order: 2
            },
            {
                label: 'Latência Média',
                data: dataLatency,
                yAxisID: 'y-latency', borderColor: '#2196F3', backgroundColor: 'rgba(33, 150, 243, 0.1)',
                tension: 0.3, pointRadius: 3, fill: false, borderDash: [5, 5], order: 3
            }]
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
            plugins: { title: { display: true, text: `Saúde da Conexão e Jitter`, color: color }, legend: { labels: { color: color } } }
        }
    });
}

function drawMaquinaChart(dataToDisplay, isDark) {
    const labels = dataToDisplay.map(row => row.Timestamp.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}));
    const dataCPU = dataToDisplay.map(row => row.Uso_CPU);
    const dataRAM = dataToDisplay.map(row => row.Uso_RAM);
    const dataDisco = dataToDisplay.map(row => row.Uso_Disco);
    
    const color = isDark ? '#f0f0f0' : '#333';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    
    const ctxMaquina = document.getElementById('maquinaChartCanvas').getContext('2d');
    chartInstanceMaquina = new Chart(ctxMaquina, {
        type: 'line', 
        data: {
            labels: labels,
            datasets: [{
                label: 'Uso de CPU (%)',
                data: dataCPU,
                borderColor: '#F44336', backgroundColor: 'rgba(244, 67, 54, 0.1)',
                tension: 0.3, fill: true, order: 1, hidden: false
            },
            {
                label: 'Uso de RAM (%)',
                data: dataRAM,
                borderColor: '#2196F3', backgroundColor: 'rgba(33, 150, 243, 0.1)',
                tension: 0.3, fill: false, order: 2
            },
            {
                label: 'Uso de Disco (%)',
                data: dataDisco,
                borderColor: '#FFC107', backgroundColor: 'rgba(255, 193, 7, 0.1)',
                tension: 0.3, fill: false, order: 3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, color: color, 
            scales: {
                x: { title: { display: true, text: 'Horário (HH:MM)', color: color }, grid: { color: gridColor }, ticks: { color: color } },
                y: { min: 0, max: 100, title: { display: true, text: 'Uso (%)', color: color }, grid: { color: gridColor }, ticks: { color: color } }
            },
            plugins: { title: { display: true, text: `Carga da Máquina (CPU, RAM, Disco)`, color: color }, legend: { labels: { color: color } } }
        }
    });
}

function drawTracertChart(lastRecord, isDark) {
    if (!lastRecord) return;
    
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
        document.getElementById('chart-tracert').innerHTML = 'Nenhum dado de rota (Tracert) válido para plotagem.';
        return;
    }

    const labels = tracertData.map(d => `Hop ${d.hop}`);
    const dataLatencies = tracertData.map(d => d.latency);
    const dataIps = tracertData.map(d => d.ip);
    
    const ctxTracert = document.getElementById('tracertChartCanvas').getContext('2d');
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
                    ticks: { color: isDark ? '#f0f0f0' : '#333' } 
                }
            },
            plugins: { 
                title: { display: true, text: `Rota do Tracert (${lastRecord.Timestamp.toLocaleTimeString()})`, color: isDark ? '#f0f0f0' : '#333' }, 
                legend: { display: false } 
            }
        }
    });
}
