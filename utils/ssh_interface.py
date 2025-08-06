import subprocess
import logging
import os
from typing import Optional, Tuple
from dotenv import load_dotenv

# Configure logging first
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Try to use persistent connection if available, fallback to subprocess
USE_PERSISTENT = False
_persistent_ssh_command = None
_persistent_check_connection = None

try:
    # Import persistent SSH functions - these use lazy initialization now
    from .ssh_persistent import run_ssh_command as _persistent_ssh_command
    from .ssh_persistent import check_ssh_connection as _persistent_check_connection
    USE_PERSISTENT = True
    logger.info("Persistent SSH connection available")
except ImportError as e:
    logger.warning(f"Persistent SSH not available: {e}")
except Exception as e:
    logger.error(f"Error importing persistent SSH: {e}")

# Load environment variables
load_dotenv()

def remove_known_host(ip: str) -> None:
    """
    Remove SSH key entry for the given IP from known_hosts.
    """
    try:
        subprocess.run(
            ["ssh-keygen", "-R", ip],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
            text=True
        )
        logger.info(f"✅ Cleared known host entry for {ip}")
    except subprocess.CalledProcessError as e:
        logger.warning(f"⚠️ Failed to remove known host for {ip}: {e.stderr.strip()}")
    except Exception as e:
        logger.warning(f"⚠️ Unexpected error removing known host: {e}")

def run_ssh_command(command: str, timeout: int = 60, retry_on_key_error: bool = True) -> str:
    # Use persistent connection if available
    if USE_PERSISTENT and _persistent_ssh_command:
        try:
            return _persistent_ssh_command(command, timeout=timeout)
        except Exception as e:
            logger.warning(f"Persistent SSH failed, falling back to subprocess: {e}")
    
    # Fallback to subprocess method
    ssh_user = os.getenv("SSH_USER", "ubuntu")
    ssh_host = os.getenv("SSH_IP", "192.168.55.1")
    ssh_password = os.getenv("SSH_PASSWORD")

    if not all([ssh_user, ssh_host, ssh_password]):
        error_msg = "Missing SSH configuration. Check environment variables."
        logger.error(error_msg)
        return f"Error: {error_msg}"

    def build_ssh_command():
        return [
            "sshpass", "-p", ssh_password,
            "ssh",
            "-o", "StrictHostKeyChecking=accept-new",  # Accept new hosts
            "-o", f"ConnectTimeout={min(timeout, 10)}",
            f"{ssh_user}@{ssh_host}",
            command
        ]

    ssh_cmd = build_ssh_command()

    try:
        logger.info(f"▶️ Running SSH command: {command}")
        result = subprocess.run(
            ssh_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
            check=True,
            text=True
        )
        logger.info(f"✅ SSH command output: {result.stdout.strip()}")
        return result.stdout.strip()

    except subprocess.CalledProcessError as e:
        stderr_output = e.stderr.strip()
        logger.warning(f"⚠️ SSH error: {stderr_output}")

        # Detect host key mismatch and retry
        if retry_on_key_error and "REMOTE HOST IDENTIFICATION HAS CHANGED" in stderr_output:
            logger.warning("⚠️ Host key mismatch detected — attempting to fix")
            remove_known_host(ssh_host)
            return run_ssh_command(command, timeout=timeout, retry_on_key_error=False)

        return f"Error: {stderr_output}"

    except subprocess.TimeoutExpired:
        error_msg = f"SSH command timed out after {timeout} seconds"
        logger.error(error_msg)
        return f"Error: {error_msg}"

    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}"

# Connection state cache
_connection_cache = {
    'connected': None,
    'last_check': None,
    'message': None
}

def check_ssh_connection() -> Tuple[bool, str]:
    """
    Test SSH connection to the device with caching.
    """
    # Use persistent connection if available
    if USE_PERSISTENT and _persistent_check_connection:
        try:
            return _persistent_check_connection()
        except Exception as e:
            logger.warning(f"Persistent SSH check failed, falling back to subprocess: {e}")
    
    # Fallback to subprocess method
    import time
    
    # Check cache (valid for 10 seconds)
    if (_connection_cache['last_check'] and 
        time.time() - _connection_cache['last_check'] < 10 and
        _connection_cache['connected'] is not None):
        return _connection_cache['connected'], _connection_cache['message']
    
    try:
        # Quick connection test with 5 second timeout
        output = run_ssh_command("echo ok", timeout=5)
        if output.strip() == "ok":
            logger.info("✅ SSH connection verified")
            _connection_cache.update({
                'connected': True,
                'message': "SSH connection successful",
                'last_check': time.time()
            })
            return True, "SSH connection successful"
        
        message = f"SSH connection failed: {output}"
        _connection_cache.update({
            'connected': False,
            'message': message,
            'last_check': time.time()
        })
        return False, message
    except Exception as e:
        message = f"Device not connected (SSH timeout)"
        _connection_cache.update({
            'connected': False,
            'message': message,
            'last_check': time.time()
        })
        return False, message

def run_sudo_command(command: str, timeout: int = 60) -> str:
    """
    Run a command with sudo, automatically providing the password.
    """
    sudo_password = os.getenv("SUDO_PASSWORD", os.getenv("SSH_PASSWORD", ""))
    
    if not sudo_password:
        logger.warning("No sudo password configured")
        return "Error: No sudo password configured"
    
    # Use echo to pipe password to sudo -S (read from stdin)
    sudo_cmd = f"echo '{sudo_password}' | sudo -S {command}"
    
    return run_ssh_command(sudo_cmd, timeout=timeout)

def execute_diagnostic_command(command: str, timeout: int = 60) -> dict:
    """
    Execute a diagnostic command and return structured output.
    """
    try:
        output = run_ssh_command(command, timeout)
        if output.startswith("Error:"):
            return {
                'status': 'error',
                'output': output,
                'raw_output': output
            }
        return {
            'status': 'success',
            'output': output,
            'raw_output': output
        }
    except Exception as e:
        error_msg = f"Diagnostic command failed: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {
            'status': 'error',
            'output': error_msg,
            'raw_output': str(e)
        }

# CLI Test
if __name__ == "__main__":
    success, message = check_ssh_connection()
    print(f"Connection test: {message}")
    if success:
        print("\nTesting simple command:")
        print(run_ssh_command("uptime"))
