// DOM Elements
const familySelect = document.getElementById('familySelect');
const machineSelect = document.getElementById('machineSelect');
const familyDescription = document.getElementById('familyDescription');
const resultsSection = document.getElementById('resultsSection');
const loadingIndicator = document.getElementById('loadingIndicator');
const explainBtn = document.getElementById('explainBtn');
const aiExplanation = document.getElementById('aiExplanation');
const explanationText = document.getElementById('explanationText');

// State
let currentFamily = '';
let currentMachine = '';

// Initialize the app
async function init() {
    await loadFamilies();
    setupEventListeners();
}

// Load machine families
async function loadFamilies() {
    try {
        const response = await fetch('/api/families');
        const families = await response.json();

        familySelect.innerHTML = '<option value="">Select a machine family...</option>';

        Object.entries(families).forEach(([key, family]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = `${family.name} - ${family.description}`;
            option.dataset.description = family.description;
            familySelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading families:', error);
        alert('Failed to load machine families. Please refresh the page.');
    }
}

// Load machines for a specific family
async function loadMachines(family) {
    try {
        machineSelect.disabled = true;
        machineSelect.innerHTML = '<option value="">Loading...</option>';

        const response = await fetch(`/api/machines/${family}`);
        const machines = await response.json();

        machineSelect.innerHTML = '<option value="">Select a machine type...</option>';

        Object.keys(machines).sort().forEach(machineType => {
            const option = document.createElement('option');
            option.value = machineType;
            option.textContent = machineType;
            machineSelect.appendChild(option);
        });

        machineSelect.disabled = false;
    } catch (error) {
        console.error('Error loading machines:', error);
        machineSelect.innerHTML = '<option value="">Error loading machines</option>';
    }
}

// Load machine details
async function loadMachineDetails(family, machineType) {
    try {
        showLoading(true);
        resultsSection.style.display = 'none';
        aiExplanation.style.display = 'none';

        const response = await fetch(`/api/machine/${family}/${machineType}`);
        const data = await response.json();

        displayMachineDetails(data);
        showLoading(false);
        resultsSection.style.display = 'block';
    } catch (error) {
        console.error('Error loading machine details:', error);
        showLoading(false);
        alert('Failed to load machine details.');
    }
}

// Display machine details
function displayMachineDetails(data) {
    const { family, type, specs } = data;

    // Update title
    document.getElementById('machineTitle').textContent = `${type} (${family} Family)`;

    // Update metric cards
    document.getElementById('vcpu').textContent = specs.vcpu;
    document.getElementById('cpuPlatform').textContent = specs.cpu_platform;

    document.getElementById('memory').textContent = specs.memory_gb;
    document.getElementById('memoryBandwidth').textContent = `${specs.memory_bandwidth_gbps} Gbps bandwidth`;

    document.getElementById('diskIops').textContent = `${specs.max_disk_iops_read.toLocaleString()}`;
    document.getElementById('diskThroughput').textContent =
        `Read: ${specs.max_disk_throughput_read_mbps} MB/s | Write: ${specs.max_disk_throughput_write_mbps} MB/s`;

    document.getElementById('network').textContent = specs.network_bandwidth_gbps;

    // Update detailed specs table
    const tableBody = document.getElementById('specsTableBody');
    tableBody.innerHTML = '';

    const specsToDisplay = [
        { label: 'vCPUs', value: specs.vcpu },
        { label: 'Memory (GB)', value: specs.memory_gb },
        { label: 'Memory Bandwidth (Gbps)', value: specs.memory_bandwidth_gbps },
        { label: 'Max Disk Read IOPS', value: specs.max_disk_iops_read.toLocaleString() },
        { label: 'Max Disk Write IOPS', value: specs.max_disk_iops_write.toLocaleString() },
        { label: 'Max Disk Read Throughput (MB/s)', value: specs.max_disk_throughput_read_mbps },
        { label: 'Max Disk Write Throughput (MB/s)', value: specs.max_disk_throughput_write_mbps },
        { label: 'Network Bandwidth (Gbps)', value: specs.network_bandwidth_gbps },
        { label: 'CPU Platform', value: specs.cpu_platform }
    ];

    specsToDisplay.forEach(spec => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${spec.label}</strong></td>
            <td>${spec.value}</td>
        `;
        tableBody.appendChild(row);
    });

    // Store current selection
    currentFamily = family;
    currentMachine = type;
}

// Load AI explanation
async function loadExplanation() {
    try {
        explainBtn.disabled = true;
        explainBtn.textContent = 'Loading...';
        aiExplanation.style.display = 'none';

        const response = await fetch(`/api/explain/${currentFamily}/${currentMachine}`);
        const data = await response.json();

        if (data.error) {
            alert(data.error);
        } else {
            explanationText.textContent = data.explanation;
            aiExplanation.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading explanation:', error);
        alert('Failed to load AI explanation. Make sure Gemini API is configured.');
    } finally {
        explainBtn.disabled = false;
        explainBtn.textContent = 'Explain Use Cases (AI)';
    }
}

// Show/hide loading indicator
function showLoading(show) {
    loadingIndicator.style.display = show ? 'block' : 'none';
}

// Setup event listeners
function setupEventListeners() {
    familySelect.addEventListener('change', (e) => {
        const selectedFamily = e.target.value;

        if (selectedFamily) {
            const selectedOption = e.target.options[e.target.selectedIndex];
            familyDescription.textContent = selectedOption.dataset.description;
            loadMachines(selectedFamily);
        } else {
            familyDescription.textContent = '';
            machineSelect.innerHTML = '<option value="">First select a machine family</option>';
            machineSelect.disabled = true;
            resultsSection.style.display = 'none';
        }

        // Reset machine selection
        resultsSection.style.display = 'none';
        aiExplanation.style.display = 'none';
    });

    machineSelect.addEventListener('change', (e) => {
        const selectedMachine = e.target.value;

        if (selectedMachine && familySelect.value) {
            loadMachineDetails(familySelect.value, selectedMachine);
        } else {
            resultsSection.style.display = 'none';
        }
    });

    explainBtn.addEventListener('click', loadExplanation);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
