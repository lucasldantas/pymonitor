// VARIÁVEIS GLOBAIS
const REPO_OWNER = 'lucasldantas';
const REPO_NAME = 'pymonitor';
const BASE_CSV_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/`;

let currentData = []; // Armazena todos os dados carregados do CSV
let currentFileName = ''; // Nome do arquivo CSV atual
let globalHeaders = []; // Armazena o cabeçalho do CSV
let isDataLoaded = false;
let maxHops = 30; // Deve ser igual ao MAX_TTL do Python

// Função auxiliar para converter o valor do campo para o tipo correto
function typeConverter(d) {
    // Conversões de Data/Hora
    d.Timestamp = new Date(d.Timestamp);
    
    // Conversões de números (forcamos para float, exceto IPs/Hops)
    d['Uso_CPU(%)'] = parseFloat(d['Uso_CPU(%)']);
    d['Uso_RAM(%)'] = parseFloat(d['Uso_RAM(%)']);
    d['Uso_Disco(%)'] = parseFloat(d['Uso_Disco(%)']);
    d['Carga_Computador(0-100)'] = parseInt(d['Carga_Computador(0-100)']);
    d['Download(Mbps)'] = parseFloat(d['Download(Mbps)']);
    d['Upload(Mbps)'] = parseFloat(d['Upload(Mbps)']);
    d['Latencia_Speedtest(ms)'] = parseFloat(d['Latencia_Speedtest(ms)']);
    d['Saude_Meet(0-100)'] = parseInt(d['Saude_Meet(0-100)']);
    d['Latencia_Meet_Media(ms)'] = parseFloat(d['Latencia_Meet_Media(ms)']);
    d['Jitter_Meet(ms)'] = parseFloat(d['Jitter_Meet(ms)']);
    d['Perda_Meet(%)'] = parseFloat(d['Perda_Meet(%)']);
    
    // Converte a Latência dos Hops para float
    for(let i = 1; i <= maxHops; i++) {
        let latKey = `Hop_LAT_${String(i).padStart(2, '0')}(ms)`;
        d[latKey] = d[latKey] ? parseFloat(d[latKey]) : 0;
    }

    return d;
}

// ----------------------------------------------------------------------
// 1. LÓGICA DE CARREGAMENTO E INICIALIZAÇÃO
// ----------------------------------------------------------------------

// Função para buscar a lista de arquivos no repositório
async function fetchAvailableDates() {
    const apiURL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/`;
    const select = document.getElementById('date-select');

    try {
        const response = await fetch(apiURL);
        const files = await response.json();
        
        // Filtra apenas arquivos CSV que seguem o padrão py_monitor_DD-MM-AA.csv
        const csvFiles = files
            .filter(file => file.name.startsWith('py_monitor_') && file.name.endsWith('.csv'))
            .map(file => file.name);

        select.innerHTML = '';
        if (csvFiles.length === 0) {
            select.innerHTML = '<option value="">Nenhum arquivo CSV encontrado.</option>';
            return;
        }

        csvFiles.forEach(fileName => {
            const option = document.createElement('option');
            option.value = fileName;
            option.textContent = fileName.replace('py_monitor_', '').replace('.csv', '');
            select.appendChild(option);
        });

        // Seleciona o arquivo mais recente por padrão (o último na lista alfabética se for bem formatado)
        select.value = csvFiles[csvFiles.length - 1];
        
        // Carrega o arquivo mais recente automaticamente
        loadData(); 

    } catch (error) {
        select.innerHTML = '<option value="">Erro ao carregar arquivos.</option>';
        console.error('Erro ao buscar arquivos do GitHub:', error);
    }
}

// Função principal para carregar o CSV
function loadData() {
    currentFileName = document.getElementById('date-select').value;
    if (!currentFileName) return;

    const fullURL = BASE_CSV_URL + currentFileName;

    d3.csv(fullURL, typeConverter).then(data => {
        currentData = data;
        if (data.length > 0) {
            globalHeaders = Object.keys(data[0]);
            
            // Verifica o tamanho da rota real no CSV
            const baseCols = 17;
            const actualTotalCols = globalHeaders.length;
            if (actualTotalCols > baseCols) {
                maxHops = (actualTotalCols - baseCols) / 2;
                console.log(`CSV carregado. Hops ajustados para ${maxHops}.`);
            }

            populateHostnames(data);
            isDataLoaded = true;
            filterData(); // Filtra e desenha com dados padrão
        } else {
            alert('O arquivo CSV está vazio.');
        }
    }).catch(error => {
        alert(`Erro ao carregar o arquivo: ${currentFileName}. Verifique se o nome está correto e se o arquivo existe.`);
        console.error('Erro de carregamento D3:', error);
    });
}

// Preenche o filtro de Hostname
function populateHostnames(data) {
    const hostnames = [...new Set(data.map(d => d.Hostname))];
    const select = document.getElementById('hostname-select');
    select.innerHTML = '<option value="all">Todas as Máquinas</option>';
    hostnames.forEach(host => {
        const option = document.createElement('option');
        option.value = host;
        option.textContent = host;
        select.appendChild(option);
    });
}


// ----------------------------------------------------------------------
// 2. LÓGICA DE FILTRAGEM E VISUALIZAÇÃO
// ----------------------------------------------------------------------

function filterData() {
    if (!isDataLoaded) return;

    const hostnameFilter = document.getElementById('hostname-select').value;
    const timeStartStr = document.getElementById('time-start').value;
    const timeEndStr = document.getElementById('time-end').value;

    let filteredData = currentData;

    // 1. Filtro por Hostname
    if (hostnameFilter !== 'all') {
        filteredData = filteredData.filter(d => d.Hostname === hostnameFilter);
    }

    // 2. Filtro por Horário (usando a coluna Timestamp)
    if (timeStartStr && timeEndStr) {
        const [hStart, mStart] = timeStartStr.split(':').map(Number);
        const [hEnd, mEnd] = timeEndStr.split(':').map(Number);

        filteredData = filteredData.filter(d => {
            if (!(d.Timestamp instanceof Date) || isNaN(d.Timestamp.getTime())) return false;
            
            const hours = d.Timestamp.getHours();
            const minutes = d.Timestamp.getMinutes();
            
            const timeInMinutes = hours * 60 + minutes;
            const startMinutes = hStart * 60 + mStart;
            const endMinutes = hEnd * 60 + mEnd;

            return timeInMinutes >= startMinutes && timeInMinutes <= endMinutes;
        });
    }

    if (filteredData.length === 0) {
        alert('Nenhum dado encontrado com os filtros aplicados.');
        // Limpa os gráficos
        document.getElementById('chart-saude-meet').innerHTML = 'Nenhum dado para mostrar.';
        document.getElementById('chart-saude-maquina').innerHTML = '';
        document.getElementById('chart-jitter').innerHTML = '';
        document.getElementById('chart-tracert').innerHTML = 'Nenhum dado de rota para o último registro.';
        return;
    }

    // 3. Desenha todos os gráficos
    drawSaudeMeetChart(filteredData);
    drawSaudeMaquinaChart(filteredData);
    drawJitterChart(filteredData);
    drawTracertChart(filteredData[filteredData.length - 1]); // Plota o tracert apenas do último registro
}

// ----------------------------------------------------------------------
// 3. FUNÇÕES DE DESENHO DE GRÁFICOS (Usando D3 - Simplificado)
// ----------------------------------------------------------------------

// Função para desenhar o gráfico de Linha (Saúde do Meet)
function drawSaudeMeetChart(data) {
    const margin = {top: 20, right: 30, bottom: 30, left: 40},
        width = 1160 - margin.left - margin.right,
        height = 300 - margin.top - margin.bottom;

    d3.select("#chart-saude-meet").select("svg").remove();

    const svg = d3.select("#chart-saude-meet")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Escalas
    const x = d3.scaleTime()
        .domain(d3.extent(data, d => d.Timestamp))
        .range([0, width]);
    
    const y = d3.scaleLinear()
        .domain([0, 100]) // Saúde vai de 0 a 100
        .range([height, 0]);

    // Eixos
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(d3.timeHour.every(2)).tickFormat(d3.timeFormat("%H:%M")));

    svg.append("g")
        .call(d3.axisLeft(y));

    // Linha (Saúde do Meet)
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#4CAF50")
        .attr("stroke-width", 2.5)
        .attr("d", d3.line()
            .x(d => x(d.Timestamp))
            .y(d => y(d['Saude_Meet(0-100)']))
        );
}

// Função para desenhar o gráfico de Linhas Múltiplas (Saúde da Máquina)
function drawSaudeMaquinaChart(data) {
    const margin = {top: 20, right: 30, bottom: 30, left: 40},
        width = 1160 - margin.left - margin.right,
        height = 300 - margin.top - margin.bottom;

    d3.select("#chart-saude-maquina").select("svg").remove();

    const svg = d3.select("#chart-saude-maquina")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime()
        .domain(d3.extent(data, d => d.Timestamp))
        .range([0, width]);
    
    const y = d3.scaleLinear()
        .domain([0, 100]) // Uso vai de 0 a 100%
        .range([height, 0]);
        
    const color = d3.scaleOrdinal()
        .domain(['CPU', 'RAM', 'Disco'])
        .range(['#F44336', '#2196F3', '#FFC107']);

    // Eixos
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(d3.timeHour.every(2)).tickFormat(d3.timeFormat("%H:%M")));
    svg.append("g").call(d3.axisLeft(y));

    // Desenha as Linhas
    const lines = [
        {key: 'Uso_CPU(%)', label: 'CPU'},
        {key: 'Uso_RAM(%)', label: 'RAM'},
        {key: 'Uso_Disco(%)', label: 'Disco'}
    ];

    lines.forEach(line => {
        svg.append("path")
            .datum(data)
            .attr("fill", "none")
            .attr("stroke", color(line.label))
            .attr("stroke-width", 1.5)
            .attr("d", d3.line()
                .defined(d => !isNaN(d[line.key])) // Não desenha se N/A ou 0.0
                .x(d => x(d.Timestamp))
                .y(d => y(d[line.key]))
            );
    });

    // Legenda (Simplificada)
    svg.selectAll(".legend")
      .data(lines)
      .enter().append("text")
      .attr("x", (d, i) => width - 100)
      .attr("y", (d, i) => 20 + i * 20)
      .attr("class", "legend")
      .style("fill", d => color(d.label))
      .text(d => d.label);
}

// Função para desenhar o gráfico de Linha (Jitter)
function drawJitterChart(data) {
    const margin = {top: 20, right: 30, bottom: 30, left: 40},
        width = 1160 - margin.left - margin.right,
        height = 300 - margin.top - margin.bottom;

    d3.select("#chart-jitter").select("svg").remove();

    const svg = d3.select("#chart-jitter")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime()
        .domain(d3.extent(data, d => d.Timestamp))
        .range([0, width]);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d['Jitter_Meet(ms)']) * 1.2]) // Escala dinâmica
        .range([height, 0]);

    // Eixos
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(d3.timeHour.every(2)).tickFormat(d3.timeFormat("%H:%M")));
    svg.append("g").call(d3.axisLeft(y));

    // Linha do Jitter
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#FF9800")
        .attr("stroke-width", 2)
        .attr("d", d3.line()
            .x(d => x(d.Timestamp))
            .y(d => y(d['Jitter_Meet(ms)']))
        );
}

// Função para desenhar o gráfico de Rota (Tracert - Último Registro)
function drawTracertChart(lastRecord) {
    d3.select("#chart-tracert").select("svg").remove();
    
    // Converte os dados planos (IP, LAT, IP, LAT...) em um array de objetos para plotagem
    const tracertData = [];
    for (let i = 1; i <= maxHops; i++) {
        const ipKey = `Hop_IP_${String(i).padStart(2, '0')}`;
        const latKey = `Hop_LAT_${String(i).padStart(2, '0')}(ms)`;
        
        const ip = lastRecord[ipKey];
        const lat = lastRecord[latKey];

        // Parar se o IP for vazio ou N/A
        if (!ip || ip === "N/A" || ip.startsWith("Erro")) break;

        tracertData.push({
            hop: i,
            ip: ip,
            latency: lat
        });
        
        if (ip.includes("[DESTINO]")) break;
    }
    
    if (tracertData.length === 0) {
        document.getElementById('chart-tracert').innerHTML = 'Nenhum dado de rota (Tracert) válido no último registro filtrado.';
        return;
    }

    const margin = {top: 20, right: 30, bottom: 100, left: 50},
        width = 1160 - margin.left - margin.right,
        height = 400 - margin.top - margin.bottom;

    const svg = d3.select("#chart-tracert")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Escalas
    const x = d3.scaleBand()
        .domain(tracertData.map(d => d.hop))
        .range([0, width])
        .padding(0.2);

    const y = d3.scaleLinear()
        .domain([0, d3.max(tracertData, d => d.latency) * 1.1])
        .range([height, 0]);

    // Eixos
    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end")
        .text(d => `${d}\n(${tracertData.find(item => item.hop === d).ip})`); // Adiciona IP na label X

    svg.append("g").call(d3.axisLeft(y));
    
    // Título do Eixo Y
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .text("Latência (ms)");

    // Barras
    svg.selectAll(".bar")
        .data(tracertData)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.hop))
        .attr("y", d => y(d.latency))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.latency))
        .attr("fill", d => d.ip.includes("[DESTINO]") ? "#00796B" : "#FF5722");
}

// ----------------------------------------------------------------------
// INICIALIZAÇÃO
// ----------------------------------------------------------------------

// Inicia o processo buscando os arquivos CSV disponíveis no GitHub
document.addEventListener('DOMContentLoaded', fetchAvailableDates);
