// Global state
let currentCalculation = null;
let diskTypeConstraints = {}; // Store min/max for each disk type
let currentOptimalSize = null; // Store current optimal disk size
let disks = []; // Array of disk configurations {id, type, size}
let diskIdCounter = 0; // Auto-increment ID for disks
let availableDiskTypes = []; // Store loaded disk types

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    loadMachines();
    loadDiskTypes();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    const machineSelect = document.getElementById('machineSelect');
    const calculateBtn = document.getElementById('calculateBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const addDiskBtn = document.getElementById('addDiskBtn');

    machineSelect.addEventListener('change', validateInputs);
    addDiskBtn.addEventListener('click', addDisk);
    calculateBtn.addEventListener('click', calculatePerformance);
    analyzeBtn.addEventListener('click', getAIAnalysis);
}

// Add a new disk to the configuration
function addDisk() {
    const diskId = diskIdCounter++;
    const defaultType = availableDiskTypes.length > 0 ? availableDiskTypes[0].disk_type : 'pd-balanced';
    const defaultSize = 100;

    const newDisk = {
        id: diskId,
        type: defaultType,
        size: defaultSize
    };

    disks.push(newDisk);
    renderDisks();
    validateInputs();
}

// Remove a disk from the configuration
function removeDisk(diskId) {
    disks = disks.filter(d => d.id !== diskId);
    renderDisks();
    validateInputs();
}

// Update disk type
function updateDiskType(diskId, newType) {
    const disk = disks.find(d => d.id === diskId);
    if (disk) {
        disk.type = newType;
        // Update size constraints for this disk
        renderDisks();
        validateInputs();
    }
}

// Update disk size
function updateDiskSize(diskId, newSize) {
    const disk = disks.find(d => d.id === diskId);
    if (disk) {
        disk.size = parseInt(newSize) || 0;
        validateInputs();
    }
}

// Render the disks list
function renderDisks() {
    const disksList = document.getElementById('disksList');
    if (!disksList) return;

    disksList.innerHTML = '';

    disks.forEach((disk, index) => {
        const diskDiv = document.createElement('div');
        diskDiv.className = 'disk-item';
        diskDiv.innerHTML = `
            <div class="disk-header">
                <span class="disk-label">Disk ${index + 1}</span>
                ${disks.length > 1 ? `<button type="button" class="remove-disk-btn" onclick="removeDisk(${disk.id})">Remove</button>` : ''}
            </div>
            <div class="disk-inputs">
                <div class="disk-input-group">
                    <label>Type</label>
                    <select class="disk-type-select" onchange="updateDiskType(${disk.id}, this.value)">
                        ${availableDiskTypes.map(dt =>
                            `<option value="${dt.disk_type}" ${dt.disk_type === disk.type ? 'selected' : ''}>${dt.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="disk-input-group">
                    <label>Size (GB)</label>
                    <input type="number"
                           class="disk-size-input"
                           value="${disk.size}"
                           min="${diskTypeConstraints[disk.type]?.min || 10}"
                           max="${diskTypeConstraints[disk.type]?.max || 65536}"
                           oninput="updateDiskSize(${disk.id}, this.value)">
                </div>
            </div>
            <div class="disk-validation" id="diskValidation${disk.id}"></div>
        `;
        disksList.appendChild(diskDiv);
    });
}

// Validate all inputs
function validateInputs() {
    const machineSelect = document.getElementById('machineSelect');
    const calculateBtn = document.getElementById('calculateBtn');

    let isValid = true;

    // Check machine selection
    if (!machineSelect.value) {
        isValid = false;
    }

    // Check that at least one disk is configured
    if (disks.length === 0) {
        isValid = false;
    }

    // Validate each disk
    disks.forEach(disk => {
        const constraints = diskTypeConstraints[disk.type];
        const validationDiv = document.getElementById(`diskValidation${disk.id}`);

        if (constraints) {
            if (disk.size < constraints.min) {
                isValid = false;
                if (validationDiv) {
                    validationDiv.textContent = `Minimum: ${constraints.min} GB`;
                    validationDiv.className = 'disk-validation error';
                }
            } else if (disk.size > constraints.max) {
                isValid = false;
                if (validationDiv) {
                    validationDiv.textContent = `Maximum: ${formatNumber(constraints.max)} GB`;
                    validationDiv.className = 'disk-validation error';
                }
            } else {
                if (validationDiv) {
                    validationDiv.textContent = '';
                    validationDiv.className = 'disk-validation';
                }
            }
        }
    });

    calculateBtn.disabled = !isValid;
    return isValid;
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

        // Store disk types globally for disk rendering
        availableDiskTypes = diskTypes;

        diskTypes.forEach(disk => {
            // Store constraints for validation
            diskTypeConstraints[disk.disk_type] = {
                min: disk.min_size_gb,
                max: disk.max_size_gb
            };
        });

        // Add first disk after disk types are loaded
        if (disks.length === 0) {
            addDisk();
        }
    } catch (error) {
        showError('Failed to load disk types');
        console.error(error);
    }
}

// Calculate performance
async function calculatePerformance() {
    const machineType = document.getElementById('machineSelect').value;

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
                disks: disks.map(d => ({
                    disk_type: d.type,
                    disk_size_gb: d.size
                }))
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

    // Update config summary - show multi-disk configuration
    let configText = `${result.machine_type} + ${result.num_disks} disk(s): `;
    const diskSummaries = result.individual_disks.map(d =>
        `${d.disk_type.toUpperCase()} ${d.disk_size_gb}GB`
    );
    configText += diskSummaries.join(', ');
    document.getElementById('configSummary').textContent = configText;

    // Check for over-provisioning warnings
    const warningDiv = document.getElementById('overProvisionWarning');
    if (warningDiv) {
        const warnings = [];

        // Check if aggregate disk IOPS exceeds machine limits
        if (result.disk_performance.iops_read > result.machine_limits.iops_read) {
            const wasted = result.disk_performance.iops_read - result.machine_limits.iops_read;
            warnings.push(`Read IOPS: Disks provide ${formatNumber(result.disk_performance.iops_read)} but machine caps at ${formatNumber(result.machine_limits.iops_read)} (${formatNumber(wasted)} wasted)`);
        }
        if (result.disk_performance.iops_write > result.machine_limits.iops_write) {
            const wasted = result.disk_performance.iops_write - result.machine_limits.iops_write;
            warnings.push(`Write IOPS: Disks provide ${formatNumber(result.disk_performance.iops_write)} but machine caps at ${formatNumber(result.machine_limits.iops_write)} (${formatNumber(wasted)} wasted)`);
        }

        // Check throughput
        if (result.disk_performance.throughput_read_mbps > result.machine_limits.throughput_read_mbps) {
            warnings.push(`Read Throughput: Disks provide ${formatNumber(result.disk_performance.throughput_read_mbps)} MB/s but machine caps at ${formatNumber(result.machine_limits.throughput_read_mbps)} MB/s`);
        }
        if (result.disk_performance.throughput_write_mbps > result.machine_limits.throughput_write_mbps) {
            warnings.push(`Write Throughput: Disks provide ${formatNumber(result.disk_performance.throughput_write_mbps)} MB/s but machine caps at ${formatNumber(result.machine_limits.throughput_write_mbps)} MB/s`);
        }

        if (warnings.length > 0) {
            warningDiv.innerHTML = `
                <div class="warning-title">⚠️ Over-provisioned Disks</div>
                <div class="warning-text">Your aggregate disk performance exceeds machine limits. Consider smaller disk sizes to save cost:</div>
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

// Display calculation breakdown with simple table format
function displayCalculationBreakdown(result) {
    const breakdown = document.getElementById('calculationBreakdown');
    const content = document.getElementById('breakdownContent');

    let html = '';

    // Display each disk's calculation
    result.individual_disks.forEach((diskPerf, idx) => {
        const diskType = diskPerf.disk_type;
        const diskSize = diskPerf.disk_size_gb;
        const diskSpecs = getDiskSpecs(diskType);

        // Disk header (only show number if multiple disks)
        const diskLabel = result.num_disks > 1
            ? `Disk ${idx + 1}: ${diskPerf.disk_name} - <span class="disk-size-highlight">${diskSize} GB</span>`
            : `${diskPerf.disk_name} - <span class="disk-size-highlight">${diskSize} GB</span>`;

        html += `<div class="calc-section">`;
        html += `<div class="calc-section-header">${diskLabel}</div>`;

        if (diskType === 'local-ssd') {
            const numDevices = Math.max(1, Math.floor(diskSize / 375));
            html += `
            <table class="calc-table">
                <tr><td>Devices</td><td>${diskSize} ÷ 375 = ${numDevices}</td></tr>
                <tr><td>Read IOPS</td><td>375,000 × ${numDevices} = <strong>${formatNumber(diskPerf.iops_read)}</strong></td></tr>
                <tr><td>Write IOPS</td><td>360,000 × ${numDevices} = <strong>${formatNumber(diskPerf.iops_write)}</strong></td></tr>
            </table>`;
        } else if (diskType.startsWith('hyperdisk')) {
            html += `
            <table class="calc-table">
                <tr><td>IOPS Range</td><td>${formatNumber(diskPerf.iops_min || 0)} - ${formatNumber(diskPerf.iops_max || 0)}</td></tr>
                <tr><td>Throughput</td><td>${diskPerf.throughput_min_mbps || 0} - ${diskPerf.throughput_max_mbps || 0} MB/s</td></tr>
            </table>
            <div class="calc-note">Hyperdisk uses provisioned performance</div>`;
        } else if (diskSpecs) {
            const hasBaseline = diskSpecs.iops_baseline_read > 0;

            // Calculate values
            const readIopsCalc = diskSpecs.iops_baseline_read + diskSize * diskSpecs.iops_per_gb_read;
            const writeIopsCalc = diskSpecs.iops_baseline_write + diskSize * diskSpecs.iops_per_gb_write;
            const readThroughputCalc = diskSize * diskSpecs.throughput_per_gb_read;
            const writeThroughputCalc = diskSize * diskSpecs.throughput_per_gb_write;

            html += `
            <table class="calc-table">
                <thead>
                    <tr>
                        <th>Metric</th>
                        <th>Formula</th>
                        <th>Calculation</th>
                        <th>Result</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Read IOPS</td>
                        <td class="formula-col">${hasBaseline ? `baseline + (size × ${diskSpecs.iops_per_gb_read})` : `size × ${diskSpecs.iops_per_gb_read}`}</td>
                        <td>${hasBaseline ? `${formatNumber(diskSpecs.iops_baseline_read)} + (${formatNumber(diskSize)} × ${diskSpecs.iops_per_gb_read})` : `${formatNumber(diskSize)} × ${diskSpecs.iops_per_gb_read}`} = ${formatNumber(readIopsCalc)}${readIopsCalc > diskSpecs.iops_max_read ? ` → max ${formatNumber(diskSpecs.iops_max_read)}` : ''}</td>
                        <td><strong>${formatNumber(diskPerf.iops_read)}</strong></td>
                    </tr>
                    <tr>
                        <td>Write IOPS</td>
                        <td class="formula-col">${hasBaseline ? `baseline + (size × ${diskSpecs.iops_per_gb_write})` : `size × ${diskSpecs.iops_per_gb_write}`}</td>
                        <td>${hasBaseline ? `${formatNumber(diskSpecs.iops_baseline_write)} + (${formatNumber(diskSize)} × ${diskSpecs.iops_per_gb_write})` : `${formatNumber(diskSize)} × ${diskSpecs.iops_per_gb_write}`} = ${formatNumber(writeIopsCalc)}${writeIopsCalc > diskSpecs.iops_max_write ? ` → max ${formatNumber(diskSpecs.iops_max_write)}` : ''}</td>
                        <td><strong>${formatNumber(diskPerf.iops_write)}</strong></td>
                    </tr>
                    <tr>
                        <td>Read MB/s</td>
                        <td class="formula-col">size × ${diskSpecs.throughput_per_gb_read}</td>
                        <td>${formatNumber(diskSize)} × ${diskSpecs.throughput_per_gb_read} = ${formatNumber(readThroughputCalc)}${readThroughputCalc > diskSpecs.throughput_max_read ? ` → max ${formatNumber(diskSpecs.throughput_max_read)}` : ''}</td>
                        <td><strong>${formatNumber(diskPerf.throughput_read_mbps)}</strong></td>
                    </tr>
                    <tr>
                        <td>Write MB/s</td>
                        <td class="formula-col">size × ${diskSpecs.throughput_per_gb_write}</td>
                        <td>${formatNumber(diskSize)} × ${diskSpecs.throughput_per_gb_write} = ${formatNumber(writeThroughputCalc)}${writeThroughputCalc > diskSpecs.throughput_max_write ? ` → max ${formatNumber(diskSpecs.throughput_max_write)}` : ''}</td>
                        <td><strong>${formatNumber(diskPerf.throughput_write_mbps)}</strong></td>
                    </tr>
                </tbody>
            </table>`;

            // Show disk type limits in a simple format
            html += `
            <div class="disk-limits-info">
                <strong>Disk Type Limits:</strong>
                ${hasBaseline ? `Baseline: ${formatNumber(diskSpecs.iops_baseline_read)} IOPS | ` : ''}
                Max IOPS: ${formatNumber(diskSpecs.iops_max_read)} (R) / ${formatNumber(diskSpecs.iops_max_write)} (W) |
                Max Throughput: ${formatNumber(diskSpecs.throughput_max_read)} (R) / ${formatNumber(diskSpecs.throughput_max_write)} (W) MB/s
            </div>`;
        }

        html += `</div>`;
    });

    // Add aggregate summary only if there are multiple disks
    if (result.num_disks > 1) {
        html += `
            <div class="calc-aggregate">
                <h5 class="calc-aggregate-title">Aggregate Performance (All Disks Combined)</h5>
                <div class="calc-aggregate-grid">
                    <div class="calc-aggregate-item">
                        <span class="agg-label">Read IOPS:</span>
                        <span class="agg-value">${formatNumber(result.disk_performance.iops_read)}</span>
                    </div>
                    <div class="calc-aggregate-item">
                        <span class="agg-label">Write IOPS:</span>
                        <span class="agg-value">${formatNumber(result.disk_performance.iops_write)}</span>
                    </div>
                    <div class="calc-aggregate-item">
                        <span class="agg-label">Read Throughput:</span>
                        <span class="agg-value">${formatNumber(result.disk_performance.throughput_read_mbps)} MB/s</span>
                    </div>
                    <div class="calc-aggregate-item">
                        <span class="agg-label">Write Throughput:</span>
                        <span class="agg-value">${formatNumber(result.disk_performance.throughput_write_mbps)} MB/s</span>
                    </div>
                </div>
            </div>
        `;
    }

    content.innerHTML = html;
    breakdown.style.display = 'block';
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
