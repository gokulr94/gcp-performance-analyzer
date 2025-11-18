// Global state
let currentCalculation = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    loadMachines();
    loadDiskTypes();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    const machineSelect = document.getElementById('machineSelect');
    const diskTypeSelect = document.getElementById('diskTypeSelect');
    const diskSizeInput = document.getElementById('diskSizeInput');
    const diskSizeSlider = document.getElementById('diskSizeSlider');
    const diskSizeDisplay = document.getElementById('diskSizeDisplay');
    const calculateBtn = document.getElementById('calculateBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');

    // Sync slider and input
    diskSizeSlider.addEventListener('input', (e) => {
        diskSizeInput.value = e.target.value;
        diskSizeDisplay.textContent = e.target.value;
        checkInputs();
    });

    diskSizeInput.addEventListener('input', (e) => {
        const value = Math.min(Math.max(e.target.value, 1), 10000);
        if (value <= 10000) {
            diskSizeSlider.value = value;
        }
        diskSizeDisplay.textContent = e.target.value || '500';
        checkInputs();
    });

    // Enable calculate button when all inputs are filled
    const checkInputs = () => {
        const isValid = machineSelect.value && diskTypeSelect.value && diskSizeInput.value && diskSizeInput.value > 0;
        calculateBtn.disabled = !isValid;
    };

    machineSelect.addEventListener('change', checkInputs);
    diskTypeSelect.addEventListener('change', checkInputs);

    calculateBtn.addEventListener('click', calculatePerformance);
    analyzeBtn.addEventListener('click', getAIAnalysis);
}

// Load all machines
async function loadMachines() {
    try {
        const response = await fetch('/api/all-machines');
        const machines = await response.json();

        // Group machines by family
        const groupedMachines = {};
        machines.forEach(machine => {
            if (!groupedMachines[machine.family]) {
                groupedMachines[machine.family] = {
                    description: machine.family_description,
                    machines: []
                };
            }
            groupedMachines[machine.family].machines.push(machine);
        });

        const machineSelect = document.getElementById('machineSelect');
        machineSelect.innerHTML = '<option value="">Select machine type...</option>';

        // Sort families: E2, N1, N2, N2D, C2, C2D, C3, M1, M2, M3
        const familyOrder = ['E2', 'N1', 'N2', 'N2D', 'C2', 'C2D', 'C3', 'M1', 'M2', 'M3'];
        familyOrder.forEach(family => {
            if (groupedMachines[family]) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = `${family} - ${groupedMachines[family].description}`;

                groupedMachines[family].machines.forEach(machine => {
                    const option = document.createElement('option');
                    option.value = machine.machine_type;
                    option.textContent = `${machine.machine_type} (${machine.vcpu} vCPU, ${machine.memory_gb} GB)`;
                    optgroup.appendChild(option);
                });

                machineSelect.appendChild(optgroup);
            }
        });
    } catch (error) {
        showError('Failed to load machine types');
        console.error(error);
    }
}

// Load disk types
async function loadDiskTypes() {
    try {
        const response = await fetch('/api/disk-types');
        const diskTypes = await response.json();

        const diskTypeSelect = document.getElementById('diskTypeSelect');
        diskTypeSelect.innerHTML = '<option value="">Select disk type...</option>';

        diskTypes.forEach(disk => {
            const option = document.createElement('option');
            option.value = disk.disk_type;
            option.textContent = `${disk.name} (${disk.type})`;
            option.title = disk.description;
            diskTypeSelect.appendChild(option);
        });
    } catch (error) {
        showError('Failed to load disk types');
        console.error(error);
    }
}

// Calculate performance
async function calculatePerformance() {
    const machineType = document.getElementById('machineSelect').value;
    const diskType = document.getElementById('diskTypeSelect').value;
    const diskSizeGb = parseInt(document.getElementById('diskSizeInput').value);

    showLoading(true);
    hideError();
    document.getElementById('resultsSection').style.display = 'none';

    try {
        const response = await fetch('/api/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                machine_type: machineType,
                disk_type: diskType,
                disk_size_gb: diskSizeGb
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Calculation failed');
        }

        const result = await response.json();
        currentCalculation = result;
        displayResults(result);
    } catch (error) {
        showError(error.message);
        console.error(error);
    } finally {
        showLoading(false);
    }
}

// Display calculation results
function displayResults(result) {
    // Show results section
    document.getElementById('resultsSection').style.display = 'block';

    // Update config summary
    document.getElementById('configSummary').textContent =
        `${result.machine_type} + ${result.disk_type.toUpperCase()} ${result.disk_size_gb}GB`;

    // Update bottleneck alert
    document.getElementById('bottleneckText').textContent = result.bottleneck;

    // Update comparison table
    updateComparisonTable(result);

    // Update machine specs
    document.getElementById('machineFamily').textContent = result.family;
    document.getElementById('machineVcpu').textContent = result.machine_limits.vcpu;
    document.getElementById('machineMemory').textContent = `${result.machine_limits.memory_gb} GB`;
    document.getElementById('machineNetwork').textContent = `${result.machine_limits.network_bandwidth_gbps} Gbps`;

    // Reset AI analysis
    document.getElementById('aiAnalysis').style.display = 'none';

    // Scroll to results
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

// Update comparison table
function updateComparisonTable(result) {
    const tbody = document.getElementById('comparisonTableBody');
    tbody.innerHTML = '';

    const metrics = [
        {
            label: 'IOPS (Read)',
            machine: result.machine_limits.iops_read,
            disk: result.disk_performance.iops_read,
            effective: result.effective_performance.iops_read
        },
        {
            label: 'IOPS (Write)',
            machine: result.machine_limits.iops_write,
            disk: result.disk_performance.iops_write,
            effective: result.effective_performance.iops_write
        },
        {
            label: 'Throughput Read (MB/s)',
            machine: result.machine_limits.throughput_read_mbps,
            disk: result.disk_performance.throughput_read_mbps,
            effective: result.effective_performance.throughput_read_mbps
        },
        {
            label: 'Throughput Write (MB/s)',
            machine: result.machine_limits.throughput_write_mbps,
            disk: result.disk_performance.throughput_write_mbps,
            effective: result.effective_performance.throughput_write_mbps
        }
    ];

    metrics.forEach(metric => {
        const row = document.createElement('tr');

        const isBottleneck = metric.effective < metric.machine;
        const bottleneckIndicator = isBottleneck ? '🔴 Disk' : '✅ Machine';

        row.innerHTML = `
            <td>${metric.label}</td>
            <td>${formatNumber(metric.machine)}</td>
            <td class="${isBottleneck ? 'bottleneck-value' : ''}">${formatNumber(metric.disk)}</td>
            <td><strong>${formatNumber(metric.effective)}</strong></td>
            <td>${bottleneckIndicator}</td>
        `;
        tbody.appendChild(row);
    });
}

// Get AI analysis
async function getAIAnalysis() {
    if (!currentCalculation) return;

    const analyzeBtn = document.getElementById('analyzeBtn');
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing...';

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                machine_type: currentCalculation.machine_type,
                disk_type: currentCalculation.disk_type,
                disk_size_gb: currentCalculation.disk_size_gb,
                bottleneck: currentCalculation.bottleneck,
                effective_performance: currentCalculation.effective_performance,
                machine_limits: currentCalculation.machine_limits
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'AI analysis failed');
        }

        const result = await response.json();
        displayAIAnalysis(result.analysis);
    } catch (error) {
        showError('AI analysis failed: ' + error.message);
        console.error(error);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Get AI Recommendations';
    }
}

// Display AI analysis
function displayAIAnalysis(analysis) {
    const aiAnalysis = document.getElementById('aiAnalysis');
    const analysisText = document.getElementById('analysisText');

    analysisText.innerHTML = analysis.replace(/\n/g, '<br>');
    aiAnalysis.style.display = 'block';

    aiAnalysis.scrollIntoView({ behavior: 'smooth' });
}

// Utility functions
function showLoading(show) {
    document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    document.getElementById('errorText').textContent = message;
    errorDiv.style.display = 'flex';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function formatNumber(value) {
    if (value === undefined || value === null) return '-';
    return value.toLocaleString();
}
