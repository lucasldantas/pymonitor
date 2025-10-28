// VARIÁVEIS GLOBAIS
let allData = [];
let chartInstanceMeet = null;
let chartInstanceMaquina = null;
let chartInstanceTracert = null;
let currentDataToDisplay = []; 
const AUTO_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutos em milissegundos
let autoUpdateTimer = null; 
const BASE_CSV_URL = './'; // Caminho relativo para o GitHub Pages

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
    // MODIFICAÇÃO: Retorna o nome do arquivo no novo formato
    const date = document.getElementById('dateSelect').value;
    return `py_monitor_${date}.csv`;
}

// Converte strings do CSV em tipos corretos
function typeConverter(row) {
    if (!row.Timestamp) return null; // Ignora linhas sem Timestamp

    // 1. Conversão de Tipos e Sanitização de Nomes
    const newRow = {};
    for (const key in row) {
        // Remove parênteses e caracteres especiais para facilitar o acesso
        const cleanKey = key.replace(/[\(\)%]/g, '').replace(' ', '_');
        newRow[cleanKey] = row[key];
    }
    
    // 2. Conversão de Tipos
    newRow.Timestamp = new Date(newRow.Timestamp);
    
    newRow.Uso_CPU = parseFloat(newRow.Uso_CPU) || 0;
    newRow.Uso_RAM = parseFloat(newRow.Uso_RAM) || 0;
    newRow.Uso_Disco = parseFloat(newRow.Uso_Disco) || 0;
    newRow.Carga_Computador = parseInt(newRow.Carga_Computador) || 0;
    newRow.DownloadMbps = parseFloat(newRow.DownloadMbps) || 0;
    newRow.UploadMbps = parseFloat(newRow.UploadMbps) || 0;
    newRow.Latencia_Speedtestms = parseFloat(newRow.Latencia_Speedtestms) || 0;
    newRow.Saude_Meet0100 = parseInt(newRow.Saude_Meet0100) || 0;
    newRow.Latencia_Meet_Mediaps = parseFloat(newRow.Latencia_Meet_Mediaps) || 0;
    newRow.Jitter_Meetms = parseFloat(newRow.Jitter_Meetms) || 0;
    newRow.Perda_Meet = parseFloat(newRow.Perda_Meet) || 0;

    // 3. Conversão de Dados de Tracert (para Gráfico)
    for (let i = 1; i <= 30; i++) {
        const ipKey = `Hop_IP_${String(i).padStart(2, '0')}`;
        const latKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;
        
        // Converte Latência para número. "" ou "N/A" se tornam 0.
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
    updateChartTheme(savedTheme === 'true');
}

function startAutoUpdate() {
    if (autoUpdateTimer) {
        clearInterval(autoUpdateTimer);
    }
    
    autoUpdateTimer = setInterval(() => {
        console.log(`Autoatualizando dados...`);
        initMonitor();
    }, AUTO_UPDATE_INTERVAL);

    console.log(`Autoatualização configurada para cada ${AUTO_UPDATE_INTERVAL / 60000} minutos.`);
}

window.onload = function() {
    applySavedTheme();
    // Ajusta o seletor de data
    document.getElementById('dateSelect').value = getCurrentDateFormatted();
    
    document.getElementById('hostnameFilter').value = ""; // Limpa filtro de hostname ao carregar
    
    // Adiciona listener nos filtros
    document.getElementById('dateSelect').addEventListener('change', initMonitor);
    document.getElementById('hostnameFilter').addEventListener('change', filterChart); 

    initMonitor(); 
    startAutoUpdate();
}

// --------------------------------------------------------------------------
// Lógica de Carregamento e PapaParse
// --------------------------------------------------------------------------

function initMonitor() {
    const statusElement = document.getElementById('statusMessage');
    const fileName = getFileName();
    const fullURL = BASE_CSV_URL + fileName;

    statusElement.textContent = `Carregando: ${fileName}...`;
    allData = []; 
    currentDataToDisplay = [];

    // Limpa filtros do Hostname e horário
    document.getElementById('startTime').value = "00:00";
    document.getElementById('endTime').value = "23:59";

    Papa.parse(fullURL, {
        download: true, 
        header: true,   
        skipEmptyLines: true,
        // Usa a função de conversão adaptada
        worker: true, // Usa um worker para grandes arquivos
        complete: function(results) {
            
            // Filtra linhas que foram convertidas com sucesso
            allData = results.data.map(typeConverter).filter(row => row !== null); 

            if (allData.length === 0) {
                statusElement.textContent = `Erro: Nenhuma linha de dados válida em ${fileName} ou arquivo não encontrado.`;
                destroyAllCharts();
                return;
            }
            
            statusElement.textContent = `Sucesso! Carregado ${allData.length} registros de ${fileName}.`;

            populateHostnames(allData); // Preenche o seletor de hostname
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
    
    // Preserva o valor atual do filtro se possível
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
// Lógica de Filtro
// --------------------------------------------------------------------------

function filterChart() {
    const startTimeStr = document.getElementById('startTime').value;
    const endTimeStr = document.getElementById('endTime').value;
    const hostnameFilter = document.getElementById('hostnameFilter').value;

    if (!allData || allData.length === 0) {
        currentDataToDisplay = [];
        return; 
    }

    const filteredData = allData.filter(row => {
        const timestamp = row.Timestamp;
        if (!(timestamp instanceof Date)) return false; // Ignora se não for data válida
        
        const timeOnly = timestamp.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit', hour12: false});
        
        const matchesHostname = hostnameFilter === 'all' || row.Hostname === hostnameFilter; 
        
        // Conversão de horário para comparação HH:MM
        const isWithinTime = timeOnly >= startTimeStr && timeOnly <= endTimeStr;

        return isWithinTime && matchesHostname;
    });

    currentDataToDisplay = filteredData;
    document.getElementById('event-details').style.display = 'none';

    drawAllCharts(filteredData);
}

// --------------------------------------------------------------------------
// Lógica de Gráfico (Chart.js)
// --------------------------------------------------------------------------

function destroyAllCharts() {
    if (chartInstanceMeet) chartInstanceMeet.destroy();
    if (chartInstanceMaquina) chartInstanceMaquina.destroy();
    if (chartInstanceTracert) chartInstanceTracert.destroy();
    document.getElementById('chart-saude-meet').innerHTML = '<canvas id="meetChartCanvas"></canvas>';
    document.getElementById('chart-saude-maquina').innerHTML = '<canvas id="maquinaChartCanvas"></canvas>';
    document.getElementById('chart-tracert').innerHTML = '<canvas id="tracertChartCanvas"></canvas>';
}

function updateChartTheme(isDark) {
    // Redesenha todos os gráficos para aplicar o tema
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
// GRÁFICO 1 & 3: SAÚDE E JITTER DO MEET
// -----------------------------------
function drawMeetCharts(dataToDisplay, isDark) {
    const labels = dataToDisplay.map(row => row.Timestamp.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}));
    const dataScores = dataToDisplay.map(row => row.Saude_Meet0100);
    const dataJitter = dataToDisplay.map(row => row.Jitter_Meetms); 
    const dataLatency = dataToDisplay.map(row => row.Latencia_Meet_Mediaps);
    
    const color = isDark ? '#f0f0f0' : '#333';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    
    // Escala Jitter/Latência
    let maxLatJitter = Math.max(d3.max(dataJitter) || 0, d3.max(dataLatency) || 0) * 1.2;
    const latencyMaxScale = Math.ceil((maxLatJitter + 10) / 50) * 50; 

    // Chart de Saúde Geral (Score)
    const ctxMeet = document.getElementById('meetChartCanvas').getContext('2d');
    chartInstanceMeet = new Chart(ctxMeet, {
        type: 'line', 
        data: {
            labels: labels,
            datasets: [{
                label: 'Saúde Geral (Score 0-100)',
                data: dataScores,
                yAxisID: 'y-score', 
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                tension: 0.3, pointRadius: 5, fill: true,
                order: 1
            },
            {
                label: 'Jitter (Variação da Latência)',
                data: dataJitter,
                yAxisID: 'y-latency', 
                borderColor: '#FFC107',
                backgroundColor: 'rgba(255, 193, 7, 0.1)',
                tension: 0.3, pointRadius: 3, fill: false,
                order: 2
            },
            {
                label: 'Latência Média',
                data: dataLatency,
                yAxisID: 'y-latency', 
                borderColor: '#2196F3',
                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                tension: 0.3, pointRadius: 3, fill: false,
                borderDash: [5, 5],
                order: 3
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

// -----------------------------------
// GRÁFICO 2: SAÚDE DA MÁQUINA
// -----------------------------------
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

// -----------------------------------
// GRÁFICO 4: TRACERT (ÚLTIMO REGISTRO)
// -----------------------------------
function drawTracertChart(lastRecord, isDark) {
    if (!lastRecord) return;
    
    const tracertData = [];
    const color = isDark ? '#f0f0f0' : '#333';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    for (let i = 1; i <= 30; i++) {
        const ipKey = `Hop_IP_${String(i).padStart(2, '0')}`;
        const latKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;
        
        const ip = lastRecord[ipKey];
        const lat = lastRecord[latKey];

        // Se a latência for 0, é um hop perdido ou preenchimento
        if (lat === 0 || lat === "" || ip === "") continue; 

        tracertData.push({
            hop: i,
            ip: ip.replace(' [DESTINO]', ''),
            latency: lat
        });

        if (ip.includes("[DESTINO]")) break;
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
            responsive: true, maintainAspectRatio: false, color: color,
            scales: {
                x: { 
                    grid: { color: gridColor }, 
                    ticks: { color: color, callback: (val, index) => `${labels[index]}\n(${dataIps[index]})` } 
                },
                y: { 
                    title: { display: true, text: 'Latência (ms)', color: color }, 
                    grid: { color: gridColor }, 
                    ticks: { color: color } 
                }
            },
            plugins: { 
                title: { display: true, text: `Rota do Tracert (${lastRecord.Timestamp.toLocaleTimeString()})`, color: color }, 
                legend: { display: false } 
            }
        }
    });
}

// --------------------------------------------------------------------------
// Lógica de Detalhe de Evento (Adaptada para Novas Colunas)
// --------------------------------------------------------------------------

function displayEventDetails(dataRow) {
    const detailsContainer = document.getElementById('event-details');
    const content = document.getElementById('event-content');

    // Campos principais
    const primaryFields = [
        { label: "Timestamp", key: "Timestamp", format: d => d.toLocaleString('pt-BR') },
        { label: "Hostname", key: "Hostname" },
        { label: "Usuário Logado", key: "Usuario" },
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
    
    // 1. Adiciona campos principais
    primaryFields.forEach(field => {
        const value = dataRow[field.key];
        const displayValue = field.format ? field.format(value) : value || 'N/A';
        html += `<p><strong>${field.label}:</strong> ${displayValue}</p>`;
    });

    // 2. Adiciona Hops Dinamicamente
    html += `<h4 style="margin-top: 15px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Detalhes do Rastreamento de Rota</h4>`;

    let foundHops = false;
    for (let i = 1; i <= 30; i++) {
        const ipKey = `Hop_IP_${String(i).padStart(2, '0')}`;
        const latencyKey = `Hop_LAT_${String(i).padStart(2, '0')}ms`;

        const ip = dataRow[ipKey];
        const latency = dataRow[latencyKey];
        
        // Exibe se o IP não for vazio
        if (ip && ip.trim() !== '') {
            const latencyValue = latency ? `${latency.toFixed(2)} ms` : 'N/A';
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

function handleChartClick(event) {
    // Verifica se a Chart.js está instalada
    if (typeof Chart === 'undefined') return; 
    
    const points = chartInstanceMeet.getElementsAtEventForMode(event, 'index', { intersect: true }, false);

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


document.addEventListener('DOMContentLoaded', () => {
    // Certifique-se de que o PapaParse esteja disponível globalmente
    if (typeof Papa === 'undefined') {
        document.getElementById('statusMessage').textContent = 'ERRO: PapaParse (CSV Reader) não está carregado. Verifique seu index.html.';
        return;
    }
    
    // O Chart.js deve ser carregado separadamente no HTML
    if (typeof Chart === 'undefined') {
         document.getElementById('statusMessage').textContent = 'AVISO: Chart.js não carregado. Gráficos desabilitados.';
    }
    
    applySavedTheme();
    document.getElementById('dateSelect').value = getCurrentDateFormatted();
    
    // Adiciona listener para aplicar filtros no clique do botão
    document.getElementById('applyFiltersButton').addEventListener('click', filterChart);

    initMonitor(); 
    startAutoUpdate();
});
