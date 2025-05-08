# V3 Diagnostics Tool

A lightweight, local web diagnostic interface for V3 sensor modules. Designed to quickly test returned units over USB connection.

SSH passwords not included for security- must be added manually in .env file.
Once complete this will enable passwordless debugging via USB.

## Features

- Power supply rail check
- Network manager status
- SIM presence and signal
- Modem presence and connection
- IMX Camera Device check and physical port verifcation 
- Condensed error log
- Core Memory logs
- GPU + CPU usage display
- Stack Disk Health check
- Zoned Temperature Readout per sensor
- 
- Summary dashboard

## Usage

1. Clone the repo:
    ```
    git clone https://github.com/YOUR_ORG/V3-Diagnostics-Tool.git
    cd V3-Diagnostics-Tool
    ```

2. Install requirements:
    ```
    pip install -r requirements.txt
    ```

3. Run the tool:
    ```
    python app.py
    ```

4. Open `http://localhost:5000` in your browser.

## Requirements

- Python 3.7+
- Flask
- pyserial (if using serial interface)

