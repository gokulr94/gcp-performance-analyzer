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
        iops_read = int(min(
            disk_size_gb * disk_spec['iops_per_gb']['read'],
            disk_spec['iops_max']['read']
        ))
        iops_write = int(min(
            disk_size_gb * disk_spec['iops_per_gb']['write'],
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

def find_machine_specs(machine_type):
    """Find machine specs across all families"""
    for family, family_data in machine_data.items():
        if machine_type in family_data['machines']:
            return {
                'family': family,
                'machine_type': machine_type,
                **family_data['machines'][machine_type]
            }
    return None

def calculate_effective_performance(machine_specs, disk_performance):
    """Calculate effective performance considering both machine and disk limits"""
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
            'vcpu': machine_specs['vcpu'],
            'memory_gb': machine_specs['memory_gb']
        },
        'disk_performance': disk_performance
    }

    # Calculate effective performance (minimum of machine and disk)
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
        effective_throughput_read = min(machine_specs['max_disk_throughput_read_mbps'], disk_performance['throughput_read_mbps'])
        effective_throughput_write = min(machine_specs['max_disk_throughput_write_mbps'], disk_performance['throughput_write_mbps'])

        result['effective_performance'] = {
            'iops_read': effective_iops_read,
            'iops_write': effective_iops_write,
            'throughput_read_mbps': effective_throughput_read,
            'throughput_write_mbps': effective_throughput_write
        }

        # Determine bottleneck
        bottlenecks = []
        if effective_iops_read < machine_specs['max_disk_iops_read']:
            bottlenecks.append('disk IOPS (read)')
        if effective_iops_write < machine_specs['max_disk_iops_write']:
            bottlenecks.append('disk IOPS (write)')
        if effective_throughput_read < machine_specs['max_disk_throughput_read_mbps']:
            bottlenecks.append('disk throughput (read)')
        if effective_throughput_write < machine_specs['max_disk_throughput_write_mbps']:
            bottlenecks.append('disk throughput (write)')

        if bottlenecks:
            result['bottleneck'] = 'Disk is the bottleneck: ' + ', '.join(bottlenecks)
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
    """Get all disk types"""
    disk_types = []
    for disk_type, specs in disk_data.items():
        disk_types.append({
            'disk_type': disk_type,
            'name': specs['name'],
            'type': specs['type'],
            'description': specs['description']
        })
    return jsonify(disk_types)

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
    except ValueError:
        return jsonify({'error': 'Invalid disk size'}), 400

    # Find machine specs
    machine_specs = find_machine_specs(machine_type)
    if not machine_specs:
        return jsonify({'error': 'Machine type not found'}), 404

    # Calculate disk performance
    disk_performance = calculate_disk_performance(disk_type, disk_size_gb)
    if not disk_performance:
        return jsonify({'error': 'Disk type not found'}), 404

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
