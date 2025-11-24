from flask import Flask, render_template, jsonify, request
import json
import os
from dotenv import load_dotenv
import google.generativeai as genai

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configure Gemini API if key is available
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel('gemini-2.5-pro')
else:
    model = None

# Load data
def load_machine_data():
    with open('data/machines.json', 'r') as f:
        return json.load(f)

def load_disk_data():
    with open('data/disks.json', 'r') as f:
        return json.load(f)

machine_data = load_machine_data()
disk_data = load_disk_data()

# Calculator functions
def calculate_disk_performance(disk_type, disk_size_gb):
    """Calculate disk IOPS and throughput based on type and size"""
    if disk_type not in disk_data:
        return None

    disk_spec = disk_data[disk_type]
    result = {
        'disk_type': disk_type,
        'disk_name': disk_spec['name'],
        'disk_size_gb': disk_size_gb
    }

    # Handle different disk types
    if disk_type == 'local-ssd':
        # Local SSD has fixed performance per device
        num_devices = max(1, disk_size_gb / 375)
        result['iops_read'] = int(disk_spec['iops_fixed']['read'] * num_devices)
        result['iops_write'] = int(disk_spec['iops_fixed']['write'] * num_devices)
        result['throughput_read_mbps'] = int(disk_spec['throughput_fixed']['read'] * num_devices)
        result['throughput_write_mbps'] = int(disk_spec['throughput_fixed']['write'] * num_devices)

    elif disk_type.startswith('hyperdisk'):
        # Hyperdisk has provisioned performance ranges
        result['iops_min'] = disk_spec.get('iops_min', disk_spec.get('iops_fixed', 0))
        result['iops_max'] = disk_spec.get('iops_max', disk_spec.get('iops_fixed', 0))
        result['throughput_min_mbps'] = disk_spec['throughput_min']
        result['throughput_max_mbps'] = disk_spec['throughput_max']
        result['note'] = disk_spec['note']

    else:
        # Standard, Balanced, SSD, Extreme - scale with size
        # Include baseline IOPS if available
        baseline_read = disk_spec.get('iops_baseline', {}).get('read', 0)
        baseline_write = disk_spec.get('iops_baseline', {}).get('write', 0)

        iops_read = int(min(
            baseline_read + disk_size_gb * disk_spec['iops_per_gb']['read'],
            disk_spec['iops_max']['read']
        ))
        iops_write = int(min(
            baseline_write + disk_size_gb * disk_spec['iops_per_gb']['write'],
            disk_spec['iops_max']['write']
        ))
        throughput_read = int(min(
            disk_size_gb * disk_spec['throughput_per_gb']['read'],
            disk_spec['throughput_max']['read']
        ))
        throughput_write = int(min(
            disk_size_gb * disk_spec['throughput_per_gb']['write'],
            disk_spec['throughput_max']['write']
        ))

        result['iops_read'] = iops_read
        result['iops_write'] = iops_write
        result['throughput_read_mbps'] = throughput_read
        result['throughput_write_mbps'] = throughput_write

    return result

def find_machine_specs(machine_type, disk_type=None):
    """Find machine specs across all families, with disk-specific limits if provided"""
    for family, family_data in machine_data.items():
        if machine_type in family_data['machines']:
            machine = family_data['machines'][machine_type]
            result = {
                'family': family,
                'machine_type': machine_type,
                'vcpu': machine['vcpu'],
                'memory_gb': machine['memory_gb'],
                'network_bandwidth_gbps': machine['network_bandwidth_gbps'],
                'cpu_platform': machine.get('cpu_platform', 'Unknown')
            }

            # Get disk-specific limits
            if disk_type and 'disk_limits' in machine:
                if disk_type in machine['disk_limits']:
                    limits = machine['disk_limits'][disk_type]
                else:
                    # Fallback to first available disk type
                    limits = list(machine['disk_limits'].values())[0]

                result['max_disk_iops_read'] = limits['max_disk_iops_read']
                result['max_disk_iops_write'] = limits['max_disk_iops_write']
                result['max_disk_throughput_read_mbps'] = limits['max_disk_throughput_read_mbps']
                result['max_disk_throughput_write_mbps'] = limits['max_disk_throughput_write_mbps']
            elif 'disk_limits' in machine:
                # No disk type specified, use first available
                limits = list(machine['disk_limits'].values())[0]
                result['max_disk_iops_read'] = limits['max_disk_iops_read']
                result['max_disk_iops_write'] = limits['max_disk_iops_write']
                result['max_disk_throughput_read_mbps'] = limits['max_disk_throughput_read_mbps']
                result['max_disk_throughput_write_mbps'] = limits['max_disk_throughput_write_mbps']
            else:
                # Old format without disk_limits (backward compatibility)
                result['max_disk_iops_read'] = machine.get('max_disk_iops_read', 0)
                result['max_disk_iops_write'] = machine.get('max_disk_iops_write', 0)
                result['max_disk_throughput_read_mbps'] = machine.get('max_disk_throughput_read_mbps', 0)
                result['max_disk_throughput_write_mbps'] = machine.get('max_disk_throughput_write_mbps', 0)

            return result
    return None

def calculate_effective_performance(machine_specs, disk_performance):
    """Calculate effective performance considering machine, disk, and network limits"""
    # Convert network bandwidth from Gbps to MB/s (1 Gbps = 125 MB/s)
    network_throughput_mbps = machine_specs['network_bandwidth_gbps'] * 125

    result = {
        'machine_type': machine_specs['machine_type'],
        'family': machine_specs['family'],
        'disk_type': disk_performance['disk_type'],
        'disk_size_gb': disk_performance['disk_size_gb'],
        'machine_limits': {
            'iops_read': machine_specs['max_disk_iops_read'],
            'iops_write': machine_specs['max_disk_iops_write'],
            'throughput_read_mbps': machine_specs['max_disk_throughput_read_mbps'],
            'throughput_write_mbps': machine_specs['max_disk_throughput_write_mbps'],
            'network_bandwidth_gbps': machine_specs['network_bandwidth_gbps'],
            'network_throughput_mbps': network_throughput_mbps,
            'vcpu': machine_specs['vcpu'],
            'memory_gb': machine_specs['memory_gb']
        },
        'disk_performance': disk_performance
    }

    # Calculate effective performance (minimum of machine, disk, and network)
    if disk_performance['disk_type'].startswith('hyperdisk'):
        # Hyperdisk shows ranges
        result['effective_performance'] = {
            'note': 'Hyperdisk uses provisioned performance. Configure within the specified ranges.',
            'iops_range': f"{disk_performance.get('iops_min', 0)} - {disk_performance.get('iops_max', 0)}",
            'throughput_range_mbps': f"{disk_performance['throughput_min_mbps']} - {disk_performance['throughput_max_mbps']}"
        }
        result['bottleneck'] = 'Configure provisioned performance within limits'
    else:
        effective_iops_read = min(machine_specs['max_disk_iops_read'], disk_performance['iops_read'])
        effective_iops_write = min(machine_specs['max_disk_iops_write'], disk_performance['iops_write'])

        # For throughput, also consider network bandwidth
        effective_throughput_read = min(
            machine_specs['max_disk_throughput_read_mbps'],
            disk_performance['throughput_read_mbps'],
            network_throughput_mbps
        )
        effective_throughput_write = min(
            machine_specs['max_disk_throughput_write_mbps'],
            disk_performance['throughput_write_mbps'],
            network_throughput_mbps
        )

        result['effective_performance'] = {
            'iops_read': effective_iops_read,
            'iops_write': effective_iops_write,
            'throughput_read_mbps': effective_throughput_read,
            'throughput_write_mbps': effective_throughput_write
        }

        # Determine bottleneck
        bottlenecks = []

        # Check IOPS bottlenecks
        if effective_iops_read < machine_specs['max_disk_iops_read']:
            bottlenecks.append('disk IOPS (read)')
        if effective_iops_write < machine_specs['max_disk_iops_write']:
            bottlenecks.append('disk IOPS (write)')

        # Check throughput bottlenecks (disk vs network vs machine)
        if effective_throughput_read < machine_specs['max_disk_throughput_read_mbps']:
            if disk_performance['throughput_read_mbps'] <= network_throughput_mbps:
                bottlenecks.append('disk throughput (read)')
            else:
                bottlenecks.append('network bandwidth (read)')

        if effective_throughput_write < machine_specs['max_disk_throughput_write_mbps']:
            if disk_performance['throughput_write_mbps'] <= network_throughput_mbps:
                bottlenecks.append('disk throughput (write)')
            else:
                bottlenecks.append('network bandwidth (write)')

        if bottlenecks:
            result['bottleneck'] = 'Bottleneck: ' + ', '.join(bottlenecks)
        else:
            result['bottleneck'] = 'Machine type is the limiting factor'

    return result

# API Routes
@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

@app.route('/api/all-machines')
def get_all_machines():
    """Get all machine types in a flat list"""
    all_machines = []
    for family, family_data in machine_data.items():
        for machine_type, specs in family_data['machines'].items():
            all_machines.append({
                'machine_type': machine_type,
                'family': family,
                'family_description': family_data['description'],
                'vcpu': specs['vcpu'],
                'memory_gb': specs['memory_gb'],
                'display_name': f"{machine_type} ({family})"
            })

    # Sort by machine type name
    all_machines.sort(key=lambda x: x['machine_type'])
    return jsonify(all_machines)

@app.route('/api/disk-types')
def get_disk_types():
    """Get all disk types with size constraints"""
    disk_types = []
    for disk_type, specs in disk_data.items():
        disk_types.append({
            'disk_type': disk_type,
            'name': specs['name'],
            'type': specs['type'],
            'description': specs['description'],
            'min_size_gb': specs.get('min_size_gb', 10),
            'max_size_gb': specs.get('max_size_gb', 65536)
        })
    return jsonify(disk_types)

@app.route('/api/optimal-disk-size', methods=['POST'])
def get_optimal_disk_size():
    """Calculate optimal disk size to match machine IOPS limits"""
    data = request.get_json()

    machine_type = data.get('machine_type')
    disk_type = data.get('disk_type')

    if not machine_type or not disk_type:
        return jsonify({'error': 'Missing machine_type or disk_type'}), 400

    # Get disk specs first to validate
    if disk_type not in disk_data:
        return jsonify({'error': 'Disk type not found'}), 404

    # Get machine specs with disk-specific limits
    machine_specs = find_machine_specs(machine_type, disk_type)
    if not machine_specs:
        return jsonify({'error': 'Machine type not found'}), 404

    disk_spec = disk_data[disk_type]

    # Calculate optimal size based on BOTH IOPS and throughput
    machine_max_iops = machine_specs['max_disk_iops_read']
    machine_max_throughput = machine_specs['max_disk_throughput_read_mbps']

    # Handle different disk types
    if disk_type == 'local-ssd' or disk_type.startswith('hyperdisk'):
        # These have fixed or provisioned performance
        optimal_size = 100
    else:
        # Standard, Balanced, SSD, Extreme - calculate based on formula
        baseline = disk_spec.get('iops_baseline', {}).get('read', 0)
        iops_per_gb = disk_spec['iops_per_gb']['read']
        disk_max_iops = disk_spec['iops_max']['read']
        throughput_per_gb = disk_spec['throughput_per_gb']['read']
        disk_max_throughput = disk_spec['throughput_max']['read']

        min_size = disk_spec.get('min_size_gb', 10)
        max_size = disk_spec.get('max_size_gb', 65536)

        # Calculate optimal size for IOPS
        if iops_per_gb > 0:
            optimal_for_iops = int((machine_max_iops - baseline) / iops_per_gb)
            # Check disk max
            actual_iops = baseline + (optimal_for_iops * iops_per_gb)
            if actual_iops > disk_max_iops:
                optimal_for_iops = int((disk_max_iops - baseline) / iops_per_gb)
        else:
            optimal_for_iops = max_size

        # Calculate optimal size for throughput
        if throughput_per_gb > 0:
            optimal_for_throughput = int(machine_max_throughput / throughput_per_gb)
            # Check disk max
            if optimal_for_throughput * throughput_per_gb > disk_max_throughput:
                optimal_for_throughput = int(disk_max_throughput / throughput_per_gb)
        else:
            optimal_for_throughput = max_size

        # Use the smaller of the two to not exceed either limit
        optimal_size = min(optimal_for_iops, optimal_for_throughput)
        optimal_size = max(min_size, min(optimal_size, max_size))

    # Calculate what IOPS this size would give
    disk_perf = calculate_disk_performance(disk_type, optimal_size)

    return jsonify({
        'optimal_size_gb': optimal_size,
        'machine_max_iops': machine_max_iops,
        'disk_iops_at_optimal': disk_perf.get('iops_read', 0) if disk_perf else 0
    })

@app.route('/api/calculate', methods=['POST'])
def calculate():
    """Calculate performance based on machine type, disk type, and disk size"""
    data = request.get_json()

    machine_type = data.get('machine_type')
    disk_type = data.get('disk_type')
    disk_size_gb = data.get('disk_size_gb')

    if not all([machine_type, disk_type, disk_size_gb]):
        return jsonify({'error': 'Missing required parameters'}), 400

    try:
        disk_size_gb = int(disk_size_gb)
    except (ValueError, TypeError):
        return jsonify({'error': 'Disk size must be a valid number'}), 400

    # Validate disk size is positive
    if disk_size_gb <= 0:
        return jsonify({'error': 'Disk size must be greater than 0'}), 400

    # Validate disk type exists and get constraints
    if disk_type not in disk_data:
        return jsonify({'error': f'Unknown disk type: {disk_type}'}), 404

    disk_spec = disk_data[disk_type]
    min_size = disk_spec.get('min_size_gb', 10)
    max_size = disk_spec.get('max_size_gb', 65536)

    # Validate disk size against type-specific constraints
    if disk_size_gb < min_size:
        return jsonify({
            'error': f'Disk size too small for {disk_spec["name"]}. Minimum: {min_size} GB'
        }), 400

    if disk_size_gb > max_size:
        return jsonify({
            'error': f'Disk size too large for {disk_spec["name"]}. Maximum: {max_size:,} GB'
        }), 400

    # Find machine specs with disk-specific limits
    machine_specs = find_machine_specs(machine_type, disk_type)
    if not machine_specs:
        return jsonify({'error': f'Unknown machine type: {machine_type}'}), 404

    # Calculate disk performance
    disk_performance = calculate_disk_performance(disk_type, disk_size_gb)
    if not disk_performance:
        return jsonify({'error': 'Failed to calculate disk performance'}), 500

    # Calculate effective performance
    result = calculate_effective_performance(machine_specs, disk_performance)

    return jsonify(result)

@app.route('/api/analyze', methods=['POST'])
def analyze_bottleneck():
    """Use Gemini to analyze bottleneck and provide recommendations"""
    if not model:
        return jsonify({'error': 'Gemini API not configured'}), 503

    data = request.get_json()

    machine_type = data.get('machine_type')
    disk_type = data.get('disk_type')
    disk_size_gb = data.get('disk_size_gb')
    bottleneck = data.get('bottleneck')
    effective_performance = data.get('effective_performance')
    machine_limits = data.get('machine_limits')

    prompt = f"""You are a GCP support engineer analyzing a performance bottleneck.

Customer Configuration:
- Machine Type: {machine_type}
- Disk Type: {disk_type}
- Disk Size: {disk_size_gb} GB

Bottleneck Analysis:
{bottleneck}

Current Effective Performance:
{json.dumps(effective_performance, indent=2)}

Machine Type Limits:
{json.dumps(machine_limits, indent=2)}

Provide:
1. Brief explanation of the bottleneck (1-2 sentences)
2. Specific recommendations to resolve it:
   - If disk is bottleneck: Suggest increasing disk size or upgrading disk type
   - If machine is bottleneck: Suggest upgrading machine type
3. Cost-performance trade-offs to consider

Keep response concise and actionable for a support engineer."""

    try:
        response = model.generate_content(prompt)
        return jsonify({
            'analysis': response.text
        })
    except Exception as e:
        return jsonify({'error': f'Failed to generate analysis: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
