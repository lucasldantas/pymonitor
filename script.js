<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monitoramento de Diagnóstico de Rede e Máquina</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { font-family: 'Arial', sans-serif; margin: 0; background-color: #f4f4f4; }
        header { background-color: #333; color: white; padding: 15px; text-align: center; }
        .container { max-width: 1200px; margin: 20px auto; padding: 0 20px; }
        .controls { background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .chart-container { background-color: #fff; padding: 20px; margin-top: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .chart-container h3 { margin-top: 0; color: #555; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .filter-group label { margin-right: 10px; font-weight: bold; }
        .filter-group input, .filter-group select, .filter-group button { padding: 8px; margin-right: 10px; border: 1px solid #ccc; border-radius: 4px; }
        /* Estilos para os gráficos D3 (se precisar) */
        .axis path, .axis line { fill: none; stroke: #333; shape-rendering: crispEdges; }
        .tooltip { position: absolute; text-align: center; padding: 8px; font: 12px sans-serif; background: lightsteelblue; border: 0px; border-radius: 4px; pointer-events: none; opacity: 0; }
    </style>
</head>
<body>

    <header>
        <h1>Monitoramento de Qualidade de Serviço (QoS)</h1>
        <p>Análise de Carga da Máquina e Saúde da Rede para Google Meet</p>
    </header>

    <div class="container">
        <div class="controls">
            <h2>Filtros de Dados</h2>
            <div class="filter-group">
                <label for="date-select">1. Selecionar Data do Arquivo (.csv):</label>
                <select id="date-select">
                    <option value="">Carregando datas...</option>
                </select>
                <button onclick="loadData()">Carregar Dados</button>
            </div>
            
            <div class="filter-group" style="margin-top: 15px;">
                <label for="hostname-select">2. Filtrar por Máquina (Hostname):</label>
                <select id="hostname-select">
                    <option value="all">Todas as Máquinas</option>
                </select>

                <label for="time-start">3. Intervalo de Horário:</label>
                <input type="time" id="time-start" value="00:00">
                <label for="time-end">até</label>
                <input type="time" id="time-end" value="23:59">
                
                <button onclick="filterData()">Aplicar Filtros</button>
            </div>
        </div>

        <div class="chart-container">
            <h3>Gráfico 1: Saúde Geral da Conexão (Meet Score)</h3>
            <div id="chart-saude-meet"></div>
        </div>

        <div class="chart-container">
            <h3>Gráfico 2: Saúde da Máquina (CPU, RAM, Disco)</h3>
            <div id="chart-saude-maquina"></div>
        </div>

        <div class="chart-container">
            <h3>Gráfico 3: Detalhe do Jitter (Variação de Latência do Meet)</h3>
            <div id="chart-jitter"></div>
        </div>

        <div class="chart-container">
            <h3>Gráfico 4: Detalhe da Rota (Latência por Hop do último registro)</h3>
            <div id="chart-tracert"></div>
        </div>

    </div>

    <script src="script.js"></script>
</body>
</html>
