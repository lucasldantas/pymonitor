<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Monitoramento de Diagnóstico de Rede e Máquina</title>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap" rel="stylesheet"/>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" rel="stylesheet"/>

    <style>
        /* Variáveis de Cores */
        :root { --bg-light: #f7f7f7; --bg-card: #ffffff; --text-dark: #2c3e50; --primary: #3498db; --shadow: 0 4px 8px rgba(0, 0, 0, 0.05); --border: #e0e0e0; }
        body.dark-mode { --bg-light: #1e2124; --bg-card: #282b30; --text-dark: #ffffff; --primary: #7289da; --shadow: 0 4px 8px rgba(0, 0, 0, 0.3); --border: #444; }

        /* Layout e Tipografia */
        body { font-family: 'Roboto', sans-serif; margin: 0; background: var(--bg-light); color: var(--text-dark); transition: background-color .3s, color .3s; }
        header { background: var(--primary); color: #fff; padding: 25px; text-align: center; box-shadow: 0 2px 10px rgba(0, 0, 0, .2); }
        .container { max-width: 1300px; margin: 20px auto; padding: 0 20px; }
        
        /* Cards & Controles */
        .controls { background: var(--bg-card); padding: 25px; border-radius: 12px; box-shadow: var(--shadow); margin-bottom: 25px; }
        .chart-container { position: relative; height: 420px; background: var(--bg-card); padding: 25px; border-radius: 12px; box-shadow: var(--shadow); margin-bottom: 25px; }
        
        /* Filtros */
        .filter-group { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; }
        .filter-group label { font-weight: 500; min-width: 120px; }
        
        /* ESTILO DOS INPUTS GERAIS E BOTÕES */
        .filter-group input:not([type="checkbox"]), .filter-group select, .controls button.btn-filter-action, .dropdown-toggle {
            padding: 10px; border: 1px solid var(--border); border-radius: 8px;
            background: transparent; color: var(--text-dark);
            transition: border-color .3s;
        }
        .controls button { background: var(--primary); color: #fff; border: 0; font-weight: 700; cursor: pointer; }
        .controls button:hover { opacity: 0.9; }

        /* Animação de Status e Carregamento */
        #statusContainer { display: flex; align-items: center; margin-bottom: 15px; height: 20px; }
        #statusIcon { margin-right: 10px; font-size: 1.2em; }
        .loading .fas { color: var(--primary); animation: spin 1s linear infinite; }
        .success .fas { color: #2ecc71; }
        .error .fas { color: #e74c3c; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        
        /* Estilo Detalhes (Mantidos) */
        #event-details { display: none; border-left: 5px solid #27ae60; background: var(--bg-card); padding: 25px; border-radius: 12px; box-shadow: var(--shadow); margin-bottom: 25px; }


        /* --- CSS PARA SELEÇÃO MÚLTIPLA (NOVO) --- */
        .hostname-control {
            position: relative;
            min-width: 200px;
        }
        .dropdown-toggle {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            cursor: pointer;
            text-align: left;
        }
        .dropdown-menu {
            position: absolute;
            z-index: 1000;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-top: none;
            border-radius: 0 0 8px 8px;
            box-shadow: var(--shadow);
            max-height: 250px;
            overflow-y: auto;
            display: none;
            padding: 5px 0;
        }
        .dropdown-menu.show {
            display: block;
        }
        .filter-option {
            padding: 8px 15px;
            display: flex;
            align-items: center;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .filter-option label {
            cursor: pointer;
            margin-bottom: 0;
            min-width: auto;
            font-weight: 400;
            margin-left: 10px;
        }
        .filter-option:hover {
            background-color: rgba(var(--primary-rgb, 52, 152, 219), 0.1);
        }
        .dark-mode .filter-option:hover {
            background-color: rgba(var(--primary-rgb, 114, 137, 218), 0.2);
        }
        .dropdown-menu hr {
            border: 0;
            border-top: 1px solid var(--border);
            margin: 5px 0;
        }
        .dropdown-arrow {
            transition: transform 0.3s;
        }
        .dropdown-toggle[aria-expanded="true"] .dropdown-arrow {
            transform: rotate(180deg);
        }
    </style>
</head>
<body>
    <header>
        <h1><i class="fas fa-chart-line"></i> Monitoramento de QoS</h1>
        <p>Análise de Carga da Máquina e Saúde da Rede para Google Meet</p>
    </header>

    <div class="container">

        <div class="controls">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h2>Filtros e Dados</h2>
                <div class="theme-toggle-container">
                    <label for="checkbox" style="font-weight:normal;">Tema Escuro</label>
                    <input type="checkbox" id="checkbox" />
                </div>
            </div>

            <div id="statusContainer">
                <span id="statusIcon"></span>
                <span id="statusMessage">Aguardando inicialização...</span>
            </div>

            <div class="filter-group">
                <label for="dateSelect">1. Data do Arquivo (.csv):</label>
                <input type="text" id="dateSelect" placeholder="DD-MM-YY" style="width: 100px; text-align:center;" />
                <button id="btnBuscar" class="btn-filter-action"><i class="fas fa-search"></i> Buscar Data</button>
                
                <label>2. Máquina (Hostname):</label>
                <div class="hostname-control" id="hostnameDropdownContainer">
                    <button class="dropdown-toggle" id="hostnameDropdownToggle" aria-expanded="false" onclick="toggleDropdown()">
                        <span id="selectedHostnameSummary">Carregando...</span>
                        <i class="fas fa-chevron-down dropdown-arrow"></i>
                    </button>
                    <div class="dropdown-menu" id="hostnameDropdownMenu">
                        </div>
                </div>
                <label for="startTime">3. Intervalo de Horário:</label>
                <input type="time" id="startTime" value="00:00" style="width: 90px;" />
                <label for="endTime">até</label>
                <input type="time" id="endTime" value="23:59" style="width: 90px;" />

                <button id="applyFiltersButton" class="btn-filter-action"><i class="fas fa-filter"></i> Aplicar Filtros</button>
            </div>
        </div>

        <div id="event-details">
            <h2 style="margin-top:0;">Detalhes do Evento Selecionado</h2>
            <div id="event-content">Clique em um ponto no gráfico de "Saúde Geral" para ver os detalhes do Tracert.</div>
        </div>

        <div class="chart-container" id="chart-saude-maquina">
            <h3><i class="fas fa-desktop"></i> 1. Carga Detalhada do Computador (CPU, RAM, Disco e Carga Média)</h3>
            <canvas id="maquinaChartCanvas"></canvas>
        </div>

        <div class="chart-container" id="chart-velocidade">
            <h3><i class="fas fa-tachometer-alt"></i> 2. Teste de Velocidade da Internet (Download, Upload, Latência)</h3>
            <canvas id="velocidadeChartCanvas"></canvas>
        </div>

        <div class="chart-container" id="chart-saude-meet">
            <h3><i class="fas fa-wifi"></i> 3. Teste de Qualidade do Meet (Saúde, Latência Média, Jitter)</h3>
            <canvas id="meetChartCanvas"></canvas>
        </div>

        <div class="chart-container" id="chart-tracert">
            <h3><i class="fas fa-route"></i> 4. Tracert do Meet (Rota por Salto)</h3>
            <canvas id="tracertChartCanvas"></canvas>
        </div>

    </div>

    <script src="script.js"></script>
</body>
</html>
