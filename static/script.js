// Global state
let currentCalculation = null;
let diskTypeConstraints = {}; // Store min/max for each disk type
let currentOptimalSize = null; // Store current optimal disk size

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
    const calculateBtn = document.getElementById('calculateBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');

    // Validate inputs and update UI
    const validateInputs = () => {
        const diskType = diskTypeSelect.value;
        const diskSize = parseInt(diskSizeInput.value) || 0;
        const constraints = diskTypeConstraints[diskType];

        let isValid = machineSelect.value && diskType && diskSize > 0;
        let errorMessage = '';

        let warningMessage = '';

        if (constraints && diskSize > 0) {
            if (diskSize < constraints.min) {
                isValid = false;
                errorMessage = `Minimum size for this disk type: ${constraints.min} GB`;
            } else if (diskSize > constraints.max) {
                isValid = false;
                errorMessage = `Maximum size for this disk type: ${formatNumber(constraints.max)} GB`;
            }
        }

        // Update validation UI
        const validationDiv = document.getElementById('diskSizeValidation');
        if (validationDiv) {
            if (errorMessage) {
                validationDiv.textContent = errorMessage;
                validationDiv.className = 'validation-error';
                diskSizeInput.classList.add('input-error');
                diskSizeInput.classList.remove('input-warning');
            } else if (warningMessage) {
                validationDiv.textContent = warningMessage;
                validationDiv.className = 'validation-warning';
                diskSizeInput.classList.remove('input-error');
                diskSizeInput.classList.add('input-warning');
            } else {
                validationDiv.textContent = '';
                validationDiv.className = '';
                diskSizeInput.classList.remove('input-error');
                diskSizeInput.classList.remove('input-warning');
            }
        }

        calculateBtn.disabled = !isValid;
        return isValid;
    };

    // Update disk size constraints and fetch optimal size
    const updateDiskConstraints = async () => {
        const diskType = diskTypeSelect.value;
        const machineType = machineSelect.value;
        const constraints = diskTypeConstraints[diskType];

        if (constraints) {
            diskSizeInput.min = constraints.min;
            diskSizeInput.max = constraints.max;

            // Update hint text
            const hint = document.getElementById('diskSizeHint');
            if (hint) {
                hint.textContent = `Enter disk size in GB (min: ${constraints.min}, max: ${formatNumber(constraints.max)})`;
            }
        }

        // Fetch optimal disk size for this machine/disk combination
        if (machineType && diskType) {
            await updateOptimalDiskSize(machineType, diskType);
        }

        validateInputs();
    };

    // Update optimal disk size when machine type changes
    const updateMachineSelection = async () => {
        const diskType = diskTypeSelect.value;
        const machineType = machineSelect.value;

        if (machineType && diskType) {
            await updateOptimalDiskSize(machineType, diskType);
        }

        validateInputs();
    };

    machineSelect.addEventListener('change', updateMachineSelection);
    diskTypeSelect.addEventListener('change', updateDiskConstraints);
    diskSizeInput.addEventListener('input', validateInputs);

    calculateBtn.addEventListener('click', calculatePerformance);
    analyzeBtn.addEventListener('click', getAIAnalysis);
}

// Fetch and set optimal disk size for machine/disk combination
async function updateOptimalDiskSize(machineType, diskType) {
    try {
        const response = await fetch('/api/optimal-disk-size', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                machine_type: machineType,
                disk_type: diskType
            })
        });

        if (response.ok) {
            const result = await response.json();
            const diskSizeInput = document.getElementById('diskSizeInput');
            diskSizeInput.value = result.optimal_size_gb;

            // Store optimal size for validation warnings
            currentOptimalSize = result.optimal_size_gb;

            // Update hint to show why this value
            const hint = document.getElementById('diskSizeHint');
            if (hint) {
                const constraints = diskTypeConstraints[diskType];
                hint.innerHTML = `Optimal: <strong>${formatNumber(result.optimal_size_gb)} GB</strong> for ${formatNumber(result.machine_max_iops)} IOPS (min: ${constraints.min}, max: ${formatNumber(constraints.max)})`;
            }
        }
    } catch (error) {
        console.error('Failed to fetch optimal disk size:', error);
    }
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

        // Sort machines within each family by vCPU (small to large), then by memory
        Object.values(groupedMachines).forEach(family => {
            family.machines.sort((a, b) => {
                if (a.vcpu !== b.vcpu) {
                    return a.vcpu - b.vcpu;
                }
                return a.memory_gb - b.memory_gb;
            });
        });

        const machineSelect = document.getElementById('machineSelect');
        machineSelect.innerHTML = '';

        // Sort families: E2, N1, N2, N2D, C2, C2D, C3, C3D, C4, N4, Z3, M1, M2, M3
        const familyOrder = ['E2', 'N1', 'N2', 'N2D', 'C2', 'C2D', 'C3', 'C3D', 'C4', 'N4', 'Z3', 'M1', 'M2', 'M3'];
        let firstOption = true;
        familyOrder.forEach(family => {
            if (groupedMachines[family]) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = `${family} - ${groupedMachines[family].description}`;

                groupedMachines[family].machines.forEach(machine => {
                    const option = document.createElement('option');
                    option.value = machine.machine_type;
                    option.textContent = `${machine.machine_type} (${machine.vcpu} vCPU, ${machine.memory_gb} GB)`;
                    // Select e2-standard-2 as default
                    if (machine.machine_type === 'e2-standard-2') {
                        option.selected = true;
                    }
                    optgroup.appendChild(option);
                });

                machineSelect.appendChild(optgroup);
            }
        });

        // Enable calculate button after loading
        document.getElementById('calculateBtn').disabled = false;
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
        const diskSizeInput = document.getElementById('diskSizeInput');
        diskTypeSelect.innerHTML = '';

        diskTypes.forEach(disk => {
            // Store constraints for validation
            diskTypeConstraints[disk.disk_type] = {
                min: disk.min_size_gb,
                max: disk.max_size_gb
            };

            const option = document.createElement('option');
            option.value = disk.disk_type;
            option.textContent = `${disk.name} (${disk.type})`;
            option.title = disk.description;
            // Select pd-balanced as default
            if (disk.disk_type === 'pd-balanced') {
                option.selected = true;
            }
            diskTypeSelect.appendChild(option);
        });

        // Set initial constraints for default disk type
        const defaultConstraints = diskTypeConstraints['pd-balanced'];
        if (defaultConstraints) {
            diskSizeInput.min = defaultConstraints.min;
            diskSizeInput.max = defaultConstraints.max;
        }

        // Set optimal disk size for default machine/disk combination
        const machineSelect = document.getElementById('machineSelect');
        if (machineSelect.value) {
            await updateOptimalDiskSize(machineSelect.value, 'pd-balanced');
        } else {
            // Wait for machines to load, then set optimal size
            setTimeout(async () => {
                const machineType = document.getElementById('machineSelect').value;
                if (machineType) {
                    await updateOptimalDiskSize(machineType, 'pd-balanced');
                }
            }, 100);
        }
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

    // Check for over-provisioning warnings
    const warningDiv = document.getElementById('overProvisionWarning');
    if (warningDiv) {
        const warnings = [];

        // Check if disk IOPS exceeds machine limits
        if (result.disk_performance.iops_read > result.machine_limits.iops_read) {
            const wasted = result.disk_performance.iops_read - result.machine_limits.iops_read;
            warnings.push(`Read IOPS: Disk provides ${formatNumber(result.disk_performance.iops_read)} but machine caps at ${formatNumber(result.machine_limits.iops_read)} (${formatNumber(wasted)} wasted)`);
        }
        if (result.disk_performance.iops_write > result.machine_limits.iops_write) {
            const wasted = result.disk_performance.iops_write - result.machine_limits.iops_write;
            warnings.push(`Write IOPS: Disk provides ${formatNumber(result.disk_performance.iops_write)} but machine caps at ${formatNumber(result.machine_limits.iops_write)} (${formatNumber(wasted)} wasted)`);
        }

        // Check throughput
        if (result.disk_performance.throughput_read_mbps > result.machine_limits.throughput_read_mbps) {
            warnings.push(`Read Throughput: Disk provides ${formatNumber(result.disk_performance.throughput_read_mbps)} MB/s but machine caps at ${formatNumber(result.machine_limits.throughput_read_mbps)} MB/s`);
        }
        if (result.disk_performance.throughput_write_mbps > result.machine_limits.throughput_write_mbps) {
            warnings.push(`Write Throughput: Disk provides ${formatNumber(result.disk_performance.throughput_write_mbps)} MB/s but machine caps at ${formatNumber(result.machine_limits.throughput_write_mbps)} MB/s`);
        }

        if (warnings.length > 0) {
            warningDiv.innerHTML = `
                <div class="warning-title">⚠️ Over-provisioned Disk</div>
                <div class="warning-text">Your disk performance exceeds machine limits. Consider a smaller disk size to save cost:</div>
                <ul class="warning-list">${warnings.map(w => `<li>${w}</li>`).join('')}</ul>
            `;
            warningDiv.style.display = 'block';
        } else {
            warningDiv.style.display = 'none';
        }
    }

    // Update quick summary cards
    updateSummaryCards(result);

    // Update comparison table
    updateComparisonTable(result);

    // Display calculation breakdown
    displayCalculationBreakdown(result);

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

// Update quick summary cards
function updateSummaryCards(result) {
    const networkMbps = result.machine_limits.network_throughput_mbps;

    const metrics = [
        {
            id: 'ReadIops',
            value: result.effective_performance.iops_read,
            machine: result.machine_limits.iops_read,
            disk: result.disk_performance.iops_read,
            network: null, // IOPS not affected by network
            unit: ''
        },
        {
            id: 'WriteIops',
            value: result.effective_performance.iops_write,
            machine: result.machine_limits.iops_write,
            disk: result.disk_performance.iops_write,
            network: null, // IOPS not affected by network
            unit: ''
        },
        {
            id: 'ReadThroughput',
            value: result.effective_performance.throughput_read_mbps,
            machine: result.machine_limits.throughput_read_mbps,
            disk: result.disk_performance.throughput_read_mbps,
            network: networkMbps,
            unit: ' MB/s'
        },
        {
            id: 'WriteThroughput',
            value: result.effective_performance.throughput_write_mbps,
            machine: result.machine_limits.throughput_write_mbps,
            disk: result.disk_performance.throughput_write_mbps,
            network: networkMbps,
            unit: ' MB/s'
        }
    ];

    metrics.forEach(metric => {
        const utilization = Math.round((metric.value / metric.machine) * 100);
        const isOverProvisioned = metric.disk > metric.machine;

        // Update value
        document.getElementById(`summary${metric.id}`).textContent =
            formatNumber(metric.value) + metric.unit;

        // Update progress bar - green if within limit, red if over
        const bar = document.getElementById(`bar${metric.id}`);
        bar.style.width = `${Math.min(utilization, 100)}%`;
        bar.className = 'bar-fill ' + (isOverProvisioned ? 'red' : 'green');

        // Update status
        const status = document.getElementById(`status${metric.id}`);
        if (isOverProvisioned) {
            status.textContent = 'Over-provisioned';
            status.className = 'summary-status over-provisioned';
        } else {
            status.textContent = 'Within limit';
            status.className = 'summary-status within-limit';
        }
    });
}

// Get color class by limit type
// Green = within machine limit, Red = exceeds machine limit (wasted)
function getColorClassByType(limitType, diskValue, machineValue) {
    if (diskValue > machineValue) {
        return 'red'; // Over-provisioned, wasted
    }
    return 'green'; // Within limits, efficient
}

// Get color class based on utilization
function getColorClass(utilization, isDiskLimited) {
    if (isDiskLimited) {
        return utilization < 50 ? 'red' : 'yellow';
    }
    return 'green';
}

// Toggle collapsible section
function toggleSection(sectionId) {
    const content = document.getElementById(sectionId);
    const icon = document.getElementById(sectionId + 'Icon');

    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}

// Update comparison table
function updateComparisonTable(result) {
    const tbody = document.getElementById('comparisonTableBody');
    tbody.innerHTML = '';
    const networkMbps = result.machine_limits.network_throughput_mbps;

    const metrics = [
        {
            label: 'IOPS (Read)',
            machine: result.machine_limits.iops_read,
            disk: result.disk_performance.iops_read,
            effective: result.effective_performance.iops_read,
            network: null
        },
        {
            label: 'IOPS (Write)',
            machine: result.machine_limits.iops_write,
            disk: result.disk_performance.iops_write,
            effective: result.effective_performance.iops_write,
            network: null
        },
        {
            label: 'Throughput Read (MB/s)',
            machine: result.machine_limits.throughput_read_mbps,
            disk: result.disk_performance.throughput_read_mbps,
            effective: result.effective_performance.throughput_read_mbps,
            network: networkMbps
        },
        {
            label: 'Throughput Write (MB/s)',
            machine: result.machine_limits.throughput_write_mbps,
            disk: result.disk_performance.throughput_write_mbps,
            effective: result.effective_performance.throughput_write_mbps,
            network: networkMbps
        }
    ];

    metrics.forEach(metric => {
        const row = document.createElement('tr');

        const utilization = Math.round((metric.effective / metric.machine) * 100);
        const isOverProvisioned = metric.disk > metric.machine;
        const colorClass = isOverProvisioned ? 'red' : 'green';

        row.innerHTML = `
            <td>${metric.label}</td>
            <td>${formatNumber(metric.machine)}</td>
            <td class="${isOverProvisioned ? 'over-provisioned-value' : ''}">${formatNumber(metric.disk)}</td>
            <td><strong>${formatNumber(metric.effective)}</strong></td>
            <td>
                <div class="utilization-cell">
                    <div class="utilization-bar">
                        <div class="utilization-fill ${colorClass}" style="width: ${utilization}%"></div>
                    </div>
                    <span class="utilization-text">${utilization}%</span>
                </div>
            </td>
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

// Toggle formula panel
function toggleFormula() {
    const panel = document.getElementById('formulaPanel');
    const icon = document.getElementById('formulaToggleIcon');

    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        icon.textContent = '▼';
    } else {
        panel.style.display = 'none';
        icon.textContent = '▶';
    }
}

// Display calculation breakdown
function displayCalculationBreakdown(result) {
    const breakdown = document.getElementById('calculationBreakdown');
    const content = document.getElementById('breakdownContent');

    const diskType = result.disk_type;
    const diskSize = result.disk_size_gb;
    const diskPerf = result.disk_performance;

    let html = '';

    // Check disk type and show appropriate formula
    if (diskType === 'local-ssd') {
        const numDevices = Math.max(1, Math.floor(diskSize / 375));
        html = `
            <div class="breakdown-item">
                <div class="breakdown-label">Local SSD Calculation</div>
                <div class="breakdown-formula">Number of devices = ${diskSize} GB ÷ 375 GB = ${numDevices} device(s)</div>
                <div class="breakdown-formula">Read IOPS = 375,000 × ${numDevices} = <span class="breakdown-result">${formatNumber(diskPerf.iops_read)}</span></div>
                <div class="breakdown-formula">Write IOPS = 360,000 × ${numDevices} = <span class="breakdown-result">${formatNumber(diskPerf.iops_write)}</span></div>
            </div>
        `;
    } else if (diskType.startsWith('hyperdisk')) {
        html = `
            <div class="breakdown-item">
                <div class="breakdown-label">Hyperdisk (Provisioned Performance)</div>
                <div class="breakdown-formula">IOPS range: ${formatNumber(diskPerf.iops_min || 0)} - ${formatNumber(diskPerf.iops_max || 0)}</div>
                <div class="breakdown-formula">Throughput range: ${diskPerf.throughput_min_mbps} - ${diskPerf.throughput_max_mbps} MB/s</div>
                <div class="breakdown-note">Configure provisioned values within these ranges</div>
            </div>
        `;
    } else {
        // Standard, Balanced, SSD, Extreme
        const diskSpecs = getDiskSpecs(diskType);
        if (diskSpecs) {
            const hasBaseline = diskSpecs.iops_baseline_read > 0;
            const baselineReadStr = hasBaseline ? `${formatNumber(diskSpecs.iops_baseline_read)} + ` : '';
            const baselineWriteStr = hasBaseline ? `${formatNumber(diskSpecs.iops_baseline_write)} + ` : '';
            const calcReadIops = diskSpecs.iops_baseline_read + diskSize * diskSpecs.iops_per_gb_read;
            const calcWriteIops = diskSpecs.iops_baseline_write + diskSize * diskSpecs.iops_per_gb_write;

            html = `
                <div class="breakdown-item">
                    <div class="breakdown-label">Read IOPS</div>
                    <div class="breakdown-formula">min(${baselineReadStr}${diskSize} GB × ${diskSpecs.iops_per_gb_read} IOPS/GB, ${formatNumber(diskSpecs.iops_max_read)})</div>
                    <div class="breakdown-formula">= min(${formatNumber(calcReadIops)}, ${formatNumber(diskSpecs.iops_max_read)}) = <span class="breakdown-result">${formatNumber(diskPerf.iops_read)}</span></div>
                </div>
                <div class="breakdown-item">
                    <div class="breakdown-label">Write IOPS</div>
                    <div class="breakdown-formula">min(${baselineWriteStr}${diskSize} GB × ${diskSpecs.iops_per_gb_write} IOPS/GB, ${formatNumber(diskSpecs.iops_max_write)})</div>
                    <div class="breakdown-formula">= min(${formatNumber(calcWriteIops)}, ${formatNumber(diskSpecs.iops_max_write)}) = <span class="breakdown-result">${formatNumber(diskPerf.iops_write)}</span></div>
                </div>
                <div class="breakdown-item">
                    <div class="breakdown-label">Read Throughput</div>
                    <div class="breakdown-formula">min(${diskSize} GB × ${diskSpecs.throughput_per_gb_read} MB/s/GB, ${formatNumber(diskSpecs.throughput_max_read)})</div>
                    <div class="breakdown-formula">= min(${formatNumber(diskSize * diskSpecs.throughput_per_gb_read)}, ${formatNumber(diskSpecs.throughput_max_read)}) = <span class="breakdown-result">${formatNumber(diskPerf.throughput_read_mbps)} MB/s</span></div>
                </div>
                <div class="breakdown-item">
                    <div class="breakdown-label">Write Throughput</div>
                    <div class="breakdown-formula">min(${diskSize} GB × ${diskSpecs.throughput_per_gb_write} MB/s/GB, ${formatNumber(diskSpecs.throughput_max_write)})</div>
                    <div class="breakdown-formula">= min(${formatNumber(diskSize * diskSpecs.throughput_per_gb_write)}, ${formatNumber(diskSpecs.throughput_max_write)}) = <span class="breakdown-result">${formatNumber(diskPerf.throughput_write_mbps)} MB/s</span></div>
                </div>
            `;
        }
    }

    content.innerHTML = html;
    breakdown.style.display = html ? 'block' : 'none';
}

// Get disk specifications for formula display
function getDiskSpecs(diskType) {
    const specs = {
        'pd-standard': {
            iops_baseline_read: 0,
            iops_baseline_write: 0,
            iops_per_gb_read: 0.75,
            iops_per_gb_write: 1.5,
            iops_max_read: 7500,
            iops_max_write: 15000,
            throughput_per_gb_read: 0.12,
            throughput_per_gb_write: 0.12,
            throughput_max_read: 1200,
            throughput_max_write: 400
        },
        'pd-balanced': {
            iops_baseline_read: 3000,
            iops_baseline_write: 3000,
            iops_per_gb_read: 6,
            iops_per_gb_write: 6,
            iops_max_read: 80000,
            iops_max_write: 80000,
            throughput_per_gb_read: 0.28,
            throughput_per_gb_write: 0.28,
            throughput_max_read: 1200,
            throughput_max_write: 1200
        },
        'pd-ssd': {
            iops_baseline_read: 6000,
            iops_baseline_write: 6000,
            iops_per_gb_read: 30,
            iops_per_gb_write: 30,
            iops_max_read: 100000,
            iops_max_write: 100000,
            throughput_per_gb_read: 0.48,
            throughput_per_gb_write: 0.48,
            throughput_max_read: 1200,
            throughput_max_write: 1200
        }
    };
    return specs[diskType] || null;
}

// Display architecture diagram
function displayArchitectureDiagram(result) {
    const diagramContent = document.getElementById('diagramContent');
    const networkMbps = result.machine_limits.network_throughput_mbps;

    // Determine bottlenecks
    const readIopsBottleneck = result.disk_performance.iops_read < result.machine_limits.iops_read ? 'DISK' : 'MACHINE';
    const writeIopsBottleneck = result.disk_performance.iops_write < result.machine_limits.iops_write ? 'DISK' : 'MACHINE';
    const readThroughputBottleneck = result.disk_performance.throughput_read_mbps < result.machine_limits.throughput_read_mbps ? 'DISK' : 'MACHINE';

    const html = `
        <div class="diagram-box">
            <div class="diagram-section vm-section">
                <div class="diagram-title">${result.machine_type} VM</div>
                <div class="diagram-specs">
                    <div>CPU: ${result.machine_limits.vcpu} vCPU | Memory: ${result.machine_limits.memory_gb} GB</div>
                </div>

                <div class="diagram-component">
                    <div class="component-title">Disk Controller (Machine Disk I/O Limit)</div>
                    <div class="component-details">
                        <div>Max Read IOPS: <strong>${formatNumber(result.machine_limits.iops_read)}</strong></div>
                        <div>Max Write IOPS: <strong>${formatNumber(result.machine_limits.iops_write)}</strong></div>
                        <div>Max Read Throughput: <strong>${result.machine_limits.throughput_read_mbps} MB/s</strong></div>
                        <div>Max Write Throughput: <strong>${result.machine_limits.throughput_write_mbps} MB/s</strong></div>
                    </div>
                </div>

                <div class="diagram-arrow">▼</div>

                <div class="diagram-component">
                    <div class="component-title">Network Interface (NIC)</div>
                    <div class="component-details">
                        <div>Bandwidth: <strong>${result.machine_limits.network_bandwidth_gbps} Gbps = ${formatNumber(networkMbps)} MB/s</strong></div>
                        <div style="font-size: 0.9em; color: var(--text-light); margin-top: 5px;">
                            Shared by: Disk I/O • Internet • VM-to-VM traffic
                        </div>
                    </div>
                </div>
            </div>

            <div class="diagram-arrow">▼</div>

            <div class="diagram-section disk-section">
                <div class="diagram-title">Persistent Disk (Network-attached)</div>
                <div class="diagram-component">
                    <div class="component-title">${result.disk_performance.disk_name} - ${result.disk_size_gb} GB</div>
                    <div class="component-details">
                        <div>Read IOPS: <strong>${formatNumber(result.disk_performance.iops_read)}</strong></div>
                        <div>Write IOPS: <strong>${formatNumber(result.disk_performance.iops_write)}</strong></div>
                        <div>Read Throughput: <strong>${result.disk_performance.throughput_read_mbps} MB/s</strong></div>
                        <div>Write Throughput: <strong>${result.disk_performance.throughput_write_mbps} MB/s</strong></div>
                    </div>
                </div>
            </div>

            <div class="diagram-arrow">▼</div>

            <div class="diagram-section calculation-section">
                <div class="diagram-title">Effective Performance Calculation</div>
                <div class="calculation-box">
                    <div class="calc-formula">Effective = MIN(Machine Limit, Disk Performance, Network Limit)</div>

                    <div class="calc-example">
                        <div class="calc-metric">
                            <div class="calc-label">Read IOPS:</div>
                            <div class="calc-values">
                                <span>Machine: ${formatNumber(result.machine_limits.iops_read)}</span>
                                <span>Disk: ${formatNumber(result.disk_performance.iops_read)}</span>
                            </div>
                            <div class="calc-result">
                                = <strong>${formatNumber(result.effective_performance.iops_read)}</strong>
                                <span class="bottleneck-badge ${readIopsBottleneck.toLowerCase()}">${readIopsBottleneck} BOTTLENECK</span>
                            </div>
                        </div>

                        <div class="calc-metric">
                            <div class="calc-label">Read Throughput:</div>
                            <div class="calc-values">
                                <span>Machine: ${result.machine_limits.throughput_read_mbps} MB/s</span>
                                <span>Disk: ${result.disk_performance.throughput_read_mbps} MB/s</span>
                                <span>Network: ${formatNumber(networkMbps)} MB/s</span>
                            </div>
                            <div class="calc-result">
                                = <strong>${result.effective_performance.throughput_read_mbps} MB/s</strong>
                                <span class="bottleneck-badge ${readThroughputBottleneck.toLowerCase()}">${readThroughputBottleneck} BOTTLENECK</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="legend">
                    <div class="legend-title">Status:</div>
                    <div class="legend-items">
                        <span class="legend-item">🟢 GREEN = Disk ≤ Machine (Within limits)</span>
                        <span class="legend-item">🔴 RED = Disk > Machine (Over-provisioned)</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    diagramContent.innerHTML = html;
}
