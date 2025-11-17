from flask import Flask, render_template, jsonify
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
    model = genai.GenerativeModel('gemini-pro')
else:
    model = None

# Load machine data
def load_machine_data():
    with open('data/machines.json', 'r') as f:
        return json.load(f)

machine_data = load_machine_data()

@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

@app.route('/api/families')
def get_families():
    """Get all machine families"""
    families = {}
    for family, data in machine_data.items():
        families[family] = {
            'name': family,
            'description': data['description']
        }
    return jsonify(families)

@app.route('/api/machines/<family>')
def get_machines(family):
    """Get all machines in a specific family"""
    if family not in machine_data:
        return jsonify({'error': 'Family not found'}), 404

    return jsonify(machine_data[family]['machines'])

@app.route('/api/machine/<family>/<machine_type>')
def get_machine_details(family, machine_type):
    """Get details for a specific machine type"""
    if family not in machine_data:
        return jsonify({'error': 'Family not found'}), 404

    if machine_type not in machine_data[family]['machines']:
        return jsonify({'error': 'Machine type not found'}), 404

    machine = machine_data[family]['machines'][machine_type]
    return jsonify({
        'family': family,
        'type': machine_type,
        'specs': machine
    })

@app.route('/api/explain/<family>/<machine_type>')
def explain_machine(family, machine_type):
    """Use Gemini to explain the machine type use cases"""
    if not model:
        return jsonify({'error': 'Gemini API not configured'}), 503

    if family not in machine_data:
        return jsonify({'error': 'Family not found'}), 404

    if machine_type not in machine_data[family]['machines']:
        return jsonify({'error': 'Machine type not found'}), 404

    machine = machine_data[family]['machines'][machine_type]

    # Create prompt for Gemini
    prompt = f"""Explain the ideal use cases for the GCP machine type {machine_type} from the {family} family.

Specifications:
- vCPUs: {machine['vcpu']}
- Memory: {machine['memory_gb']} GB
- Network Bandwidth: {machine['network_bandwidth_gbps']} Gbps
- Max Disk IOPS (Read): {machine['max_disk_iops_read']}
- CPU Platform: {machine['cpu_platform']}

Provide a concise explanation (2-3 sentences) about:
1. What workloads this machine is best suited for
2. Key advantages of this configuration

Keep it practical and business-focused."""

    try:
        response = model.generate_content(prompt)
        return jsonify({
            'explanation': response.text
        })
    except Exception as e:
        return jsonify({'error': f'Failed to generate explanation: {str(e)}'}), 500

@app.route('/api/recommend', methods=['POST'])
def recommend_machine():
    """Use Gemini to recommend machine types based on workload description"""
    if not model:
        return jsonify({'error': 'Gemini API not configured'}), 503

    from flask import request
    data = request.get_json()
    workload = data.get('workload', '')

    if not workload:
        return jsonify({'error': 'Workload description required'}), 400

    # Get list of available machines for context
    available_machines = []
    for family, fdata in machine_data.items():
        for machine_type in fdata['machines'].keys():
            available_machines.append(f"{machine_type} ({family})")

    prompt = f"""Based on this workload description: "{workload}"

Recommend 2-3 suitable GCP machine types from these options and briefly explain why each is suitable.

Available machine types include: {', '.join(available_machines[:20])}... and more from families: E2 (cost-optimized), N1/N2/N2D (general-purpose), C2/C2D/C3 (compute-optimized), M1/M2/M3 (memory-optimized).

Format your response as a brief recommendation with specific machine types."""

    try:
        response = model.generate_content(prompt)
        return jsonify({
            'recommendation': response.text
        })
    except Exception as e:
        return jsonify({'error': f'Failed to generate recommendation: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
