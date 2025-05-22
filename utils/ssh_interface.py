import subprocess
import os
from dotenv import load_dotenv

load_dotenv()

def run_ssh_command(command, host=None, user=None):
    # Load from environment if not explicitly passed
    ssh_password = os.getenv("SSH_PASSWORD")
    sudo_password = os.getenv("SUDO_PASSWORD", ssh_password)
    ssh_host = host or os.getenv("SSH_IP", "192.168.55.1")
    ssh_user = user or os.getenv("SSH_USER", "ubuntu")

    # Validate required fields
    if not ssh_password or not ssh_host or not ssh_user:
        return "❌ Missing SSH credentials in .env (SSH_PASSWORD, SSH_USER, SSH_IP)"

    # Always remove known host entry to prevent fingerprint mismatch
    subprocess.run(["ssh-keygen", "-R", ssh_host], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Inject sudo password if command uses sudo
    if "sudo" in command:
        command = f"echo '{sudo_password}' | sudo -S -p '' {command.replace('sudo ', '')}"

    # Prepare the SSH command using sshpass
    ssh_command = [
        "sshpass", "-p", ssh_password,
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "LogLevel=ERROR",
        f"{ssh_user}@{ssh_host}",
        command
    ]

    try:
        result = subprocess.check_output(ssh_command, stderr=subprocess.DEVNULL)
        return result.decode().strip()
    except subprocess.CalledProcessError as e:
        return f"❌ SSH Error:\n{e.output.decode()}"
