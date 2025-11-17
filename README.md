# GCP Machine Type Performance Analyzer

A web application to explore and compare Google Cloud Platform (GCP) machine types and their maximum performance capabilities. Built with Flask and enhanced with Google's Gemini AI for intelligent insights.

## Features

- **Interactive Machine Selection**: Browse GCP machine families (E2, N1, N2, N2D, C2, C2D, C3, M1, M2, M3) and their variants
- **Comprehensive Performance Metrics**: View detailed specifications including:
  - vCPU count and CPU platform
  - Memory (GB) and memory bandwidth
  - Maximum disk IOPS (read/write)
  - Disk throughput (MB/s)
  - Network bandwidth (Gbps)
- **AI-Powered Insights** (Optional): Use Gemini AI to:
  - Explain ideal use cases for each machine type
  - Get intelligent recommendations based on workload description
- **Clean, Modern UI**: Responsive design with performance metric cards and detailed tables

## Screenshots

The application features:
- Two-tier dropdown selection (Family → Machine Type)
- Visual metric cards showing key performance indicators
- Detailed specification tables
- Optional AI explanations powered by Gemini

## Tech Stack

- **Backend**: Python 3.x, Flask
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **AI Integration**: Google Gemini API (optional)
- **Deployment**: Docker, GCP Cloud Run

## Installation

### Prerequisites

- Python 3.8 or higher
- pip (Python package manager)
- (Optional) Google Gemini API key for AI features

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd gcp-performance-analyzer
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables** (Optional for AI features)
   ```bash
   cp .env.example .env
   # Edit .env and add your Gemini API key
   ```

5. **Run the application**
   ```bash
   python app.py
   ```

6. **Open in browser**
   ```
   http://localhost:8080
   ```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Optional: Gemini API Key for AI-powered features
GEMINI_API_KEY=your_api_key_here

# Optional: Custom port (defaults to 8080)
PORT=8080
```

To get a Gemini API key:
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add it to your `.env` file

## Usage

1. **Select Machine Family**: Choose from general-purpose (E2, N1, N2, N2D), compute-optimized (C2, C2D, C3), or memory-optimized (M1, M2, M3) families
2. **Select Machine Type**: Pick a specific machine configuration (e.g., n2-standard-4, c2-standard-8)
3. **View Performance**: See comprehensive performance metrics displayed in cards and tables
4. **Get AI Insights** (if configured): Click "Explain Use Cases" for AI-powered recommendations

## Deployment to GCP

### Using Cloud Run

1. **Build the Docker image**
   ```bash
   docker build -t gcp-performance-analyzer .
   ```

2. **Tag for Google Container Registry**
   ```bash
   docker tag gcp-performance-analyzer gcr.io/[PROJECT-ID]/gcp-performance-analyzer
   ```

3. **Push to GCR**
   ```bash
   docker push gcr.io/[PROJECT-ID]/gcp-performance-analyzer
   ```

4. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy gcp-performance-analyzer \
     --image gcr.io/[PROJECT-ID]/gcp-performance-analyzer \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars GEMINI_API_KEY=your_api_key
   ```

### Using App Engine

1. **Create `app.yaml`** (already included in project)

2. **Deploy**
   ```bash
   gcloud app deploy
   ```

## API Endpoints

- `GET /` - Main application page
- `GET /api/families` - List all machine families
- `GET /api/machines/<family>` - Get machines in a specific family
- `GET /api/machine/<family>/<machine_type>` - Get detailed specs for a machine
- `GET /api/explain/<family>/<machine_type>` - Get AI explanation (requires Gemini API)
- `POST /api/recommend` - Get machine recommendations based on workload (requires Gemini API)

## Project Structure

```
gcp-performance-analyzer/
├── app.py                 # Flask backend
├── requirements.txt       # Python dependencies
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore rules
├── Dockerfile            # Docker configuration
├── README.md             # This file
├── data/
│   └── machines.json     # GCP machine type specifications
├── templates/
│   └── index.html        # Main HTML template
└── static/
    ├── style.css         # Styling
    └── script.js         # Frontend JavaScript
```

## Data Source

Machine type specifications are based on official GCP documentation and represent maximum theoretical performance limits. Data includes:

- **8 Machine Families**: E2, N1, N2, N2D, C2, C2D, C3, M1, M2, M3
- **70+ Machine Types**: From micro instances to ultra-high memory configurations
- **9 Performance Metrics** per machine type

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is open source and available under the MIT License.

## Acknowledgments

- Machine type data sourced from [Google Cloud Documentation](https://cloud.google.com/compute/docs/machine-types)
- AI capabilities powered by [Google Gemini](https://deepmind.google/technologies/gemini/)

## Support

For issues, questions, or suggestions, please open an issue on GitHub.
