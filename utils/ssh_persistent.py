"""
Persistent SSH connection manager using paramiko for better performance and reliability.
"""
import paramiko
import logging
import os
import time
import threading
from typing import Optional, Tuple
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

class PersistentSSHConnection:
    """Manages a persistent SSH connection with automatic reconnection."""
    
    def __init__(self):
        self.ssh_user = os.getenv("SSH_USER", "ubuntu")
        self.ssh_host = os.getenv("SSH_IP", "192.168.55.1")
        self.ssh_password = os.getenv("SSH_PASSWORD")
        self.ssh_port = int(os.getenv("SSH_PORT", "22"))
        
        self.client = None
        self.connected = False
        self.last_activity = None
        self.lock = threading.Lock()
        
        # Connection settings
        self.connection_timeout = 30  # 30 seconds for connection
        self.command_timeout = 60     # 60 seconds for commands by default
        self.keepalive_interval = 5   # Send keepalive every 5 seconds
        
        # Don't connect immediately - wait until first use
        logger.info("SSH connection manager initialized (not connected yet)")
        
    def connect(self) -> bool:
        """Establish SSH connection."""
        with self.lock:
            if self.connected and self.client:
                # Test if connection is still alive
                try:
                    transport = self.client.get_transport()
                    if transport and transport.is_active():
                        return True
                except:
                    pass
            
            # Close any existing connection
            self.disconnect(silent=True)
            
            try:
                logger.info(f"🔗 Connecting to {self.ssh_user}@{self.ssh_host}:{self.ssh_port}")
                
                self.client = paramiko.SSHClient()
                self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                
                # Connect with timeout
                self.client.connect(
                    hostname=self.ssh_host,
                    port=self.ssh_port,
                    username=self.ssh_user,
                    password=self.ssh_password,
                    timeout=self.connection_timeout,
                    allow_agent=False,
                    look_for_keys=False
                )
                
                # Set keepalive
                transport = self.client.get_transport()
                transport.set_keepalive(self.keepalive_interval)
                
                self.connected = True
                self.last_activity = time.time()
                logger.info("✅ SSH connection established successfully")
                return True
                
            except paramiko.AuthenticationException:
                logger.error("❌ SSH authentication failed")
                self.connected = False
                return False
            except paramiko.SSHException as e:
                logger.error(f"❌ SSH connection error: {e}")
                self.connected = False
                return False
            except Exception as e:
                logger.error(f"❌ Unexpected error during connection: {e}")
                self.connected = False
                return False
    
    def disconnect(self, silent=False):
        """Close SSH connection and clear host keys for clean reconnection."""
        if self.client:
            try:
                self.client.close()
            except:
                pass
            self.client = None
        self.connected = False
        
        # Clear SSH host keys to avoid conflicts when switching devices
        try:
            import subprocess
            subprocess.run(
                ["ssh-keygen", "-R", self.ssh_host],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            if not silent:
                logger.info(f"🧹 Cleared SSH host keys for {self.ssh_host}")
        except Exception as e:
            if not silent:
                logger.warning(f"⚠️ Could not clear host keys: {e}")
        
        if not silent:
            logger.info("🔌 SSH connection closed")
    
    def execute_command(self, command: str, timeout: Optional[int] = None) -> Tuple[bool, str]:
        """
        Execute command over persistent SSH connection.
        Returns (success, output) tuple.
        """
        if timeout is None:
            timeout = self.command_timeout
            
        # Ensure we're connected
        if not self.connect():
            return False, "Failed to establish SSH connection"
        
        try:
            logger.info(f"▶️ Executing: {command}")
            
            # Execute command
            stdin, stdout, stderr = self.client.exec_command(
                command,
                timeout=timeout,
                get_pty=True  # Get pseudo-terminal for better compatibility
            )
            
            # Set channel timeout
            stdout.channel.settimeout(timeout)
            stderr.channel.settimeout(timeout)
            
            # Read output
            output = stdout.read().decode('utf-8', errors='ignore').strip()
            error = stderr.read().decode('utf-8', errors='ignore').strip()
            
            # Get exit status
            exit_status = stdout.channel.recv_exit_status()
            
            self.last_activity = time.time()
            
            if exit_status == 0:
                logger.info(f"✅ Command completed successfully")
                return True, output
            else:
                logger.warning(f"⚠️ Command failed with exit code {exit_status}")
                return False, error if error else output
                
        except paramiko.SSHException as e:
            logger.error(f"❌ SSH command error: {e}")
            self.connected = False  # Mark as disconnected for reconnection
            return False, f"SSH error: {str(e)}"
        except Exception as e:
            logger.error(f"❌ Unexpected error: {e}")
            return False, f"Error: {str(e)}"
    
    def check_connection(self) -> Tuple[bool, str]:
        """Quick connection check."""
        success, output = self.execute_command("echo ok", timeout=5)
        if success and output == "ok":
            return True, "Connection active"
        return False, "Connection failed"
    
    def __del__(self):
        """Clean up connection on deletion."""
        self.disconnect(silent=True)

# Global connection instance - lazy initialized
_ssh_connection = None
_connection_lock = threading.Lock()

def get_ssh_connection() -> PersistentSSHConnection:
    """Get or create global SSH connection instance (thread-safe lazy initialization)."""
    global _ssh_connection
    if _ssh_connection is None:
        with _connection_lock:
            # Double-check locking pattern
            if _ssh_connection is None:
                _ssh_connection = PersistentSSHConnection()
    return _ssh_connection

def run_ssh_command(command: str, timeout: int = 60) -> str:
    """
    Backward compatible function using persistent connection.
    Default timeout increased to 60 seconds.
    """
    try:
        conn = get_ssh_connection()
        success, output = conn.execute_command(command, timeout=timeout)
        
        if success:
            return output
        else:
            return f"Error: {output}"
    except Exception as e:
        logger.error(f"Failed to execute SSH command: {e}")
        return f"Error: {str(e)}"

def check_ssh_connection() -> Tuple[bool, str]:
    """Check if SSH connection is working."""
    try:
        conn = get_ssh_connection()
        return conn.check_connection()
    except Exception as e:
        logger.error(f"Failed to check SSH connection: {e}")
        return False, f"Connection check failed: {str(e)}"

def reset_ssh_connection() -> Tuple[bool, str]:
    """Reset SSH connection by disconnecting and clearing host keys."""
    try:
        conn = get_ssh_connection()
        conn.disconnect(silent=False)
        return True, "SSH connection reset and host keys cleared"
    except Exception as e:
        logger.error(f"Failed to reset SSH connection: {e}")
        return False, f"Reset failed: {str(e)}"

# Module initialization - check if environment is properly configured but don't connect
def _check_config():
    """Check if SSH configuration is available."""
    ssh_user = os.getenv("SSH_USER")
    ssh_host = os.getenv("SSH_IP")
    ssh_password = os.getenv("SSH_PASSWORD")
    
    if not all([ssh_user, ssh_host, ssh_password]):
        logger.warning("SSH configuration incomplete - persistent connection will not be available")
        return False
    return True

# Check configuration on import but don't create connection
_config_valid = _check_config()

# Test the connection
if __name__ == "__main__":
    # Test connection
    print("Testing SSH connection...")
    connected, msg = check_ssh_connection()
    print(f"Connection: {connected} - {msg}")
    
    if connected:
        # Test command
        print("\nTesting command execution...")
        result = run_ssh_command("uptime")
        print(f"Result: {result}")
        
        # Test multiple commands
        print("\nTesting multiple commands...")
        for cmd in ["hostname", "date", "df -h /"]:
            result = run_ssh_command(cmd)
            print(f"{cmd}: {result}")