#!/usr/bin/env python3
"""
V3 Diagnostics Tool Auto-Update Launcher
Cross-platform launcher that auto-updates from GitHub
"""

import os
import sys
import subprocess
import time
import webbrowser
from pathlib import Path
import shutil

REPO_URL = "https://github.com/fdsmith22/V3-Diagnostics-Tool.git"
APP_NAME = "V3 Diagnostics Tool"
APP_DIR = Path.home() / ".v3-diagnostics-tool"
VENV_DIR = APP_DIR / "venv"

def run_command(cmd, cwd=None):
    """Run a shell command and return output"""
    try:
        result = subprocess.run(
            cmd, 
            shell=True, 
            capture_output=True, 
            text=True, 
            cwd=cwd
        )
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, "", str(e)

def setup_or_update():
    """Clone or update the repository"""
    print(f"{APP_NAME} Launcher")
    print("=" * 40)
    
    # Check if git is installed
    success, _, _ = run_command("git --version")
    if not success:
        print("ERROR: Git is not installed. Please install Git first.")
        input("Press Enter to exit...")
        sys.exit(1)
    
    # Clone or update repository
    if not APP_DIR.exists():
        print("First time setup - cloning repository...")
        APP_DIR.parent.mkdir(parents=True, exist_ok=True)
        success, _, err = run_command(f"git clone {REPO_URL} {APP_DIR}")
        if not success:
            print(f"Error cloning repository: {err}")
            input("Press Enter to exit...")
            sys.exit(1)
        needs_deps_update = True
    else:
        print("Checking for updates...")
        os.chdir(APP_DIR)
        
        # Fetch latest
        run_command("git fetch origin")
        
        # Check if update needed
        success, local, _ = run_command("git rev-parse HEAD")
        success, remote, _ = run_command("git rev-parse origin/main")
        
        if local.strip() != remote.strip():
            print("Updates available! Pulling latest version...")
            success, _, err = run_command("git pull origin main")
            if not success:
                print(f"Warning: Could not update: {err}")
            needs_deps_update = True
        else:
            print("Already up to date!")
            needs_deps_update = False
    
    return needs_deps_update

def setup_python_env(needs_deps_update):
    """Setup Python virtual environment"""
    os.chdir(APP_DIR)
    
    # Create venv if needed
    if not VENV_DIR.exists():
        print("Setting up Python environment...")
        subprocess.run([sys.executable, "-m", "venv", str(VENV_DIR)])
        needs_deps_update = True
    
    # Determine pip path
    if sys.platform == "win32":
        pip = VENV_DIR / "Scripts" / "pip.exe"
        python = VENV_DIR / "Scripts" / "python.exe"
    else:
        pip = VENV_DIR / "bin" / "pip"
        python = VENV_DIR / "bin" / "python"
    
    # Update dependencies if needed
    if needs_deps_update:
        print("Installing/updating Python dependencies...")
        subprocess.run([str(pip), "install", "-r", "requirements.txt"])
        
        # Check if npm exists for Node dependencies
        success, _, _ = run_command("npm --version")
        if success:
            print("Installing/updating Node dependencies...")
            run_command("npm install", cwd=APP_DIR)
    
    return python

def check_env_file():
    """Check if .env file exists"""
    env_file = APP_DIR / ".env"
    env_template = APP_DIR / ".env.template"
    
    if not env_file.exists():
        print("\nWARNING: No .env file found!")
        print(f"Please create {env_file} with your SSH credentials")
        
        if env_template.exists():
            print("\nWould you like to copy .env.template to .env now?")
            response = input("Enter 'y' to copy template (you'll need to edit it): ").lower()
            if response == 'y':
                shutil.copy(env_template, env_file)
                print(f"Created {env_file} - please edit it with your credentials")
                input("Press Enter after editing the file...")
        else:
            input("Press Enter to continue anyway...")

def start_flask(python):
    """Start Flask application"""
    print("Starting V3 Diagnostics Tool...")
    
    # Kill any existing Flask instances
    if sys.platform != "win32":
        run_command("pkill -f 'python.*app.py'")
    
    # Start Flask
    env = os.environ.copy()
    env['PYTHONPATH'] = str(APP_DIR)
    
    flask_process = subprocess.Popen(
        [str(python), "app.py"],
        cwd=APP_DIR,
        env=env
    )
    
    # Wait for Flask to start
    print("Waiting for server to start...")
    time.sleep(3)
    
    # Check if Flask started successfully
    if flask_process.poll() is not None:
        print("ERROR: Flask failed to start!")
        print("Check the logs for details")
        input("Press Enter to exit...")
        sys.exit(1)
    
    return flask_process

def main():
    try:
        # Setup or update repository
        needs_deps_update = setup_or_update()
        
        # Setup Python environment
        python = setup_python_env(needs_deps_update)
        
        # Check for .env file
        check_env_file()
        
        # Start Flask
        flask_process = start_flask(python)
        
        # Open browser
        print("Opening browser...")
        webbrowser.open("http://localhost:5000")
        
        print("\n" + "=" * 40)
        print(f"{APP_NAME} is running!")
        print("Browser should open automatically")
        print("If not, go to: http://localhost:5000")
        print("Press Ctrl+C to stop")
        print("=" * 40)
        
        # Keep running
        try:
            flask_process.wait()
        except KeyboardInterrupt:
            print("\nStopping V3 Diagnostics Tool...")
            flask_process.terminate()
            
    except Exception as e:
        print(f"Error: {e}")
        input("Press Enter to exit...")
        sys.exit(1)

if __name__ == "__main__":
    main()