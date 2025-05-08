# V3 Diagnostics Tool

A lightweight, local web diagnostic interface for V3 sensor modules. Designed for field technicians to quickly test returned units using USB connection.

## Features

- Power supply rail check
- Network manager status
- SIM presence and signal
- Condensed error log
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

