import subprocess
import os
from dotenv import load_dotenv

load_dotenv()

def run_ssh_command(command, host="192.168.55.1", user="ubuntu"):
    ssh_password = os.getenv("SSH_PASSWORD")
    sudo_password = os.getenv("SUDO_PASSWORD", ssh_password)  # fallback to SSH password

    if not ssh_password:
        return "SSH_PASSWORD not set in .env"

    # Wrap sudo command properly
    if "sudo" in command:
        command = f"echo '{sudo_password}' | sudo -S -p '' {command.replace('sudo ', '')}"

    # Combine everything to ensure silent, clean output
    ssh_command = [
        "sshpass", "-p", ssh_password,
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "LogLevel=ERROR",  # Suppress known_hosts warnings and other noise
        f"{user}@{host}",
        command
    ]

    try:
        result = subprocess.check_output(ssh_command, stderr=subprocess.DEVNULL)  # suppress stderr entirely
        return result.decode().strip()
    except subprocess.CalledProcessError as e:
        return f"Error:\n{e.output.decode()}"
