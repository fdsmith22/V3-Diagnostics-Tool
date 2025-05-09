# V3 Diagnostics Tool

A lightweight, local web diagnostic interface for V3 sensor modules.  
Designed to quickly test returned units over USB connection.

⚠️ SSH passwords are not included for security. You must manually create a `.env` file with credentials to enable passwordless debugging over USB.

---

## Features

- Power supply rail check
- Network manager status
- SIM presence and signal
- Modem presence and connection
- IMX camera device check and physical port verification
- Condensed error log
- Core memory logs
- GPU & CPU usage display
- Stack disk health check
- Zoned temperature readout per sensor
- Summary dashboard

---

## Usage

### 1. Clone the repository

    git clone https://github.com/fdsmith22/V3-Diagnostics-Tool.git
    cd V3-Diagnostics-Tool

### 2. Install requirements (recommended in a virtual environment)

    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt

If `requirements.txt` is missing, install manually:

    pip install flask python-dotenv

### 3. Create a `.env` file

    touch .env
    nano .env

Add your SSH credentials:

    SSH_USERNAME=your_username
    SSH_PASSWORD=your_password

Ensure `python-dotenv` is installed:

    pip install python-dotenv

Install `sshpass` if needed:

    sudo apt-get install sshpass

### 4. Run the tool

    python app.py

Then open your browser and go to:

    http://localhost:5000

---

## Requirements

- Python 3.7+
- Flask
- python-dotenv (for .env support)
- sshpass (for passwordless SSH over USB)
