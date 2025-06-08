import os
import logging
import time
import subprocess
import pexpect
import threading
import warnings
from datetime import datetime

# Comprehensive suppression of threading warnings that occur during subprocess forking
warnings.filterwarnings("ignore", message=".*Thread.__init__.*not called.*")
warnings.filterwarnings("ignore", category=RuntimeWarning, message=".*threading.*")
warnings.filterwarnings("ignore", category=RuntimeWarning, message=".*_after_fork.*")
warnings.filterwarnings("ignore", message=".*AssertionError.*")
warnings.filterwarnings("ignore", message=".*threading.py.*")

# Comprehensive threading exception suppression
def suppress_threading_exceptions():
    """Completely suppress threading exceptions using multiple methods"""
    import sys
    import os
    import subprocess
    
    # Method 1: Complete stderr suppression for threading errors
    class ThreadingErrorSuppressor:
        def __init__(self, original_stderr):
            self.original_stderr = original_stderr
            self.buffer = []
            
        def write(self, text):
            # Completely suppress any threading-related output
            if any(phrase in str(text).lower() for phrase in [
                "thread", "_after_fork", "assertionerror", 
                "threading.py", "__init__() not called",
                "set_tstate_lock", "daemon"
            ]):
                return  # Completely suppress
            self.original_stderr.write(text)
            
        def flush(self):
            try:
                self.original_stderr.flush()
            except:
                pass
            
        def fileno(self):
            try:
                return self.original_stderr.fileno()
            except:
                return 2
    
    # Apply comprehensive stderr filtering
    sys.stderr = ThreadingErrorSuppressor(sys.stderr)
    
    # Method 2: Override subprocess with isolation
    original_run = subprocess.run
    original_popen = subprocess.Popen
    
    def isolated_subprocess_run(*args, **kwargs):
        # Force complete process isolation
        kwargs.setdefault('start_new_session', True)
        if hasattr(os, 'setsid'):
            kwargs.setdefault('preexec_fn', os.setsid)
        
        # Minimal environment to avoid threading contamination
        if 'env' not in kwargs:
            kwargs['env'] = {
                'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
                'HOME': os.environ.get('HOME', '/tmp'),
                'USER': os.environ.get('USER', 'unknown')
            }
        
        try:
            # Only redirect stderr for commands that might cause threading issues
            command_str = str(args[0]) if args else ""
            if any(cmd in command_str for cmd in ['ssh', 'ping', 'sshpass']):
                if 'stderr' not in kwargs:
                    kwargs['stderr'] = subprocess.PIPE  # Capture but don't suppress
            return original_run(*args, **kwargs)
        except Exception:
            # Fallback with stderr capture
            if 'stderr' not in kwargs:
                kwargs['stderr'] = subprocess.PIPE
            return original_run(*args, **kwargs)
    
    def isolated_subprocess_popen(*args, **kwargs):
        kwargs.setdefault('start_new_session', True)
        if hasattr(os, 'setsid'):
            kwargs.setdefault('preexec_fn', os.setsid)
        return original_popen(*args, **kwargs)
    
    subprocess.run = isolated_subprocess_run
    subprocess.Popen = isolated_subprocess_popen

# Apply comprehensive suppression
suppress_threading_exceptions()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Connection cache to avoid redundant SSH tests with thread safety
_connection_cache = {
    'last_test': 0,
    'result': None,
    'cache_duration': 900  # seconds - 15 minutes to prevent connection loops
}
_cache_lock = threading.Lock()

# Additional cache for connection status
_status_cache = {
    'last_check': 0,
    'result': None,
    'cache_duration': 600  # seconds - 10 minutes to reduce polling
}
_status_cache_lock = threading.Lock()

def get_ssh_credentials():
    """
    Get SSH connection credentials from environment variables or config
    """
    return {
        'host': os.environ.get('SSH_HOST', '192.168.55.1'),
        'username': os.environ.get('SSH_USERNAME', 'ubuntu'),
        'password': os.environ.get('SSH_PASSWORD', ''),
        'port': int(os.environ.get('SSH_PORT', 22)),
        'key_file': os.environ.get('SSH_KEY_FILE', '')
    }

def validate_ssh_credentials(credentials=None):
    """
    Validate SSH credentials
    """
    if not credentials:
        credentials = get_ssh_credentials()

    required_fields = ['host', 'username']
    missing_fields = [field for field in required_fields if not credentials.get(field)]

    if missing_fields:
        return False, f"Missing required SSH credentials: {', '.join(missing_fields)}"

    # Check if we have either password or key file
    if not credentials.get('password') and not credentials.get('key_file'):
        return False, "Either SSH password or key file must be provided"

    return True, "SSH credentials valid"

def clear_known_host(hostname):
    """
    Remove a host from known_hosts file using Python instead of ssh-keygen
    """
    try:
        known_hosts_file = os.path.expanduser('~/.ssh/known_hosts')
        if os.path.exists(known_hosts_file):
            # Read and filter known_hosts file
            with open(known_hosts_file, 'r') as f:
                lines = f.readlines()
            
            # Filter out lines containing the hostname
            filtered_lines = [line for line in lines if hostname not in line]
            
            # Write back if any lines were removed
            if len(filtered_lines) < len(lines):
                with open(known_hosts_file, 'w') as f:
                    f.writelines(filtered_lines)
                logger.info(f"Cleared known host entry for {hostname}")
    except Exception as e:
        logger.warning(f"Could not clear known host for {hostname}: {e}")

def test_ssh_connection():
    """
    Enhanced SSH connection test with better error handling and thread safety
    """
    current_time = time.time()

    # Check cache first with thread safety
    with _cache_lock:
        if (current_time - _connection_cache['last_test'] < _connection_cache['cache_duration']
                and _connection_cache['result'] is not None):
            logger.debug("Using cached SSH connection result")  # Changed to debug to reduce spam
            return _connection_cache['result']

    credentials = get_ssh_credentials()

    # Validate credentials
    is_valid, validation_msg = validate_ssh_credentials(credentials)
    if not is_valid:
        result = {
            'success': False,
            'error': f"Invalid SSH configuration: {validation_msg}",
            'details': {'validation_error': validation_msg}
        }
        with _cache_lock:
            _connection_cache['result'] = result
            _connection_cache['last_test'] = current_time
        return result

    host = credentials['host']
    username = credentials['username']
    password = credentials.get('password', '')
    port = credentials.get('port', 22)

    logger.info(f"Testing SSH connection to {username}@{host}")

    try:
        # Clear any existing known host entries to avoid conflicts
        clear_known_host(host)

        # Build SSH command
        ssh_cmd = [
            'ssh',
            '-o', 'ConnectTimeout=10',
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'UserKnownHostsFile=/dev/null',
            '-o', 'LogLevel=ERROR',
            '-p', str(port),
            f'{username}@{host}',
            'echo "SSH_CONNECTION_TEST_SUCCESS"'
        ]

        # Try SSH connection - prefer pexpect to avoid subprocess permission issues
        if password:
            # Use pexpect for password authentication to avoid sshpass permission issues
            logger.info("Using pexpect for SSH authentication")
            return test_ssh_with_pexpect(credentials)
        else:
            # Try key-based authentication with subprocess as fallback
            try:
                result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=15,
                                      start_new_session=True, preexec_fn=os.setsid if hasattr(os, 'setsid') else None)
            except PermissionError:
                logger.warning("SSH subprocess permission denied, trying pexpect")
                return test_ssh_with_pexpect(credentials)
            
            # Check result for key-based auth
            if result.returncode == 0 and "SSH_CONNECTION_TEST_SUCCESS" in result.stdout:
                success_result = {
                    'success': True,
                    'message': 'SSH connection successful',
                    'details': {
                        'host': host,
                        'username': username,
                        'port': port,
                        'auth_method': 'key'
                    }
                }
                logger.info(f"SSH connection to {username}@{host} successful")
                with _cache_lock:
                    _connection_cache['result'] = success_result
                    _connection_cache['last_test'] = current_time
                return success_result
            else:
                error_msg = result.stderr.strip() or "SSH connection failed"
                logger.error(f"SSH connection failed: {error_msg}")

                # Try to provide more specific error information
                if "Connection refused" in error_msg:
                    error_msg = f"SSH connection refused: ssh: connect to host {host} port {port}: Connection refused"
                elif "Connection timed out" in error_msg:
                    error_msg = f"SSH connection timed out: ssh: connect to host {host} port {port}: Connection timed out"
                elif "Permission denied" in error_msg:
                    error_msg = "SSH authentication failed: Permission denied (publickey,password)"
                elif "Host key verification failed" in error_msg:
                    error_msg = "SSH host key verification failed"

                failure_result = {
                    'success': False,
                    'error': f"❌ SSH connection failed: {error_msg}",
                    'details': {
                        'stderr': result.stderr,
                        'stdout': result.stdout,
                        'returncode': result.returncode
                    }
                }
                with _cache_lock:
                    _connection_cache['result'] = failure_result
                    _connection_cache['last_test'] = current_time
                return failure_result

    except subprocess.TimeoutExpired:
        timeout_result = {
            'success': False,
            'error': f"❌ SSH connection timeout: Connection to {host} timed out after 15 seconds",
            'details': {'error_type': 'timeout'}
        }
        logger.error(f"SSH connection to {host} timed out")
        with _cache_lock:
            _connection_cache['result'] = timeout_result
            _connection_cache['last_test'] = current_time
        return timeout_result

    except Exception as e:
        exception_result = {
            'success': False,
            'error': f"❌ SSH connection error: {str(e)}",
            'details': {'error_type': 'exception', 'exception': str(e)}
        }
        logger.error(f"SSH connection error: {e}")
        with _cache_lock:
            _connection_cache['result'] = exception_result
            _connection_cache['last_test'] = current_time
        return exception_result

def test_ssh_with_pexpect(credentials):
    """
    Test SSH connection using pexpect when sshpass is not available
    """
    try:
        import pexpect

        host = credentials['host']
        username = credentials['username']
        password = credentials.get('password', '')
        port = credentials.get('port', 22)

        ssh_command = f"ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p {port} {username}@{host} echo 'SSH_CONNECTION_TEST_SUCCESS'"

        child = pexpect.spawn(ssh_command, timeout=15)

        index = child.expect(['password:', 'SSH_CONNECTION_TEST_SUCCESS', pexpect.TIMEOUT, pexpect.EOF])

        if index == 0:  # Password prompt
            child.sendline(password)
            index = child.expect(['SSH_CONNECTION_TEST_SUCCESS', pexpect.TIMEOUT, pexpect.EOF])

        if index == 0:  # Success
            child.close()
            return {
                'success': True,
                'message': 'SSH connection successful (pexpect)',
                'details': {
                    'host': host,
                    'username': username,
                    'port': port,
                    'auth_method': 'password'
                }
            }
        else:
            child.close()
            return {
                'success': False,
                'error': f"❌ SSH connection failed (pexpect): Authentication or connection error",
                'details': {'error_type': 'pexpect_failure'}
            }

    except Exception as e:
        return {
            'success': False,
            'error': f"❌ SSH connection error (pexpect): {str(e)}",
            'details': {'error_type': 'pexpect_exception', 'exception': str(e)}
        }

def test_internet_connectivity():
    """Test internet connectivity using Python socket instead of ping"""
    try:
        import socket
        socket.setdefaulttimeout(3)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect(("8.8.8.8", 53))
        return True
    except Exception:
        return False

def get_connection_status():
    """
    Get current connection status including SSH availability with caching
    """
    current_time = time.time()
    
    # Check cache first
    with _status_cache_lock:
        if (current_time - _status_cache['last_check'] < _status_cache['cache_duration']
                and _status_cache['result'] is not None):
            logger.debug("Using cached connection status")
            return _status_cache['result']
    
    try:
        # Test basic internet connectivity using socket
        has_internet = test_internet_connectivity()

        # Test SSH connection
        ssh_result = test_ssh_connection()

        result = {
            'internet_available': has_internet,
            'ssh_available': ssh_result['success'],
            'ssh_details': ssh_result,
            'timestamp': datetime.now().isoformat()
        }
        
        # Cache the result
        with _status_cache_lock:
            _status_cache['result'] = result
            _status_cache['last_check'] = current_time
            
        return result

    except Exception as e:
        logger.error(f"Error getting connection status: {e}")
        error_result = {
            'internet_available': False,
            'ssh_available': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }
        
        # Cache the error result too (for a shorter duration)
        with _status_cache_lock:
            _status_cache['result'] = error_result
            _status_cache['last_check'] = current_time
            
        return error_result

def run_ssh_command(command, timeout=30):
    """
    Execute a command via SSH and return the result
    Automatically handles sudo commands with password from environment
    """
    credentials = get_ssh_credentials()

    # Validate credentials
    is_valid, validation_msg = validate_ssh_credentials(credentials)
    if not is_valid:
        return {
            'success': False,
            'error': f"Invalid SSH configuration: {validation_msg}",
            'output': '',
            'stderr': validation_msg
        }

    host = credentials['host']
    username = credentials['username']
    password = credentials.get('password', '')
    port = credentials.get('port', 22)

    # Check if command requires sudo and modify accordingly
    if command.strip().startswith('sudo ') and password:
        # Use echo to pipe password to sudo for non-interactive execution
        original_command = command[5:].strip()  # Remove 'sudo ' prefix
        command = f"echo '{password}' | sudo -S {original_command}"

    try:
        # Build SSH command
        ssh_cmd = [
            'ssh',
            '-o', 'ConnectTimeout=10',
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'UserKnownHostsFile=/dev/null',
            '-o', 'LogLevel=ERROR',
            '-p', str(port),
            f'{username}@{host}',
            command
        ]

        # Execute command - prefer pexpect for password auth to avoid permission issues
        if password:
            # Use pexpect for password authentication
            return run_ssh_command_with_pexpect(command, credentials, timeout)
        else:
            try:
                result = subprocess.run(ssh_cmd, capture_output=True, text=True, timeout=timeout,
                                      start_new_session=True, preexec_fn=os.setsid if hasattr(os, 'setsid') else None)
            except PermissionError:
                # Fallback to pexpect if subprocess has permission issues
                return run_ssh_command_with_pexpect(command, credentials, timeout)

        return {
            'success': result.returncode == 0,
            'output': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode,
            'command': command
        }

    except subprocess.TimeoutExpired:
        return {
            'success': False,
            'error': f"Command timed out after {timeout} seconds",
            'output': '',
            'stderr': f"Timeout executing: {command}",
            'command': command
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'output': '',
            'stderr': str(e),
            'command': command
        }

def run_ssh_command_with_pexpect(command, credentials, timeout=30):
    """
    Execute SSH command using pexpect when sshpass is not available
    Handles sudo commands with password automation
    """
    try:
        import pexpect

        host = credentials['host']
        username = credentials['username']
        password = credentials.get('password', '')
        port = credentials.get('port', 22)

        # Check if command requires sudo and modify accordingly for pexpect
        original_command = command
        is_sudo_command = command.strip().startswith('sudo ')
        
        if is_sudo_command and password:
            # For pexpect, we'll handle sudo password prompt separately
            # Don't modify the command here, handle it in the interaction
            pass

        ssh_command = f"ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p {port} {username}@{host} {command}"

        child = pexpect.spawn(ssh_command, timeout=timeout)

        # Handle SSH password prompt
        index = child.expect(['password:', pexpect.TIMEOUT, pexpect.EOF])

        if index == 0:  # SSH password prompt
            child.sendline(password)
            
            # If it's a sudo command, we might get another password prompt
            if is_sudo_command:
                index = child.expect(['password for', 'Password:', pexpect.TIMEOUT, pexpect.EOF], timeout=5)
                if index in [0, 1]:  # sudo password prompt
                    child.sendline(password)
            
            child.expect(pexpect.EOF, timeout=timeout)

        output = child.before.decode('utf-8') if child.before else ''
        
        # Clean up any password prompts from output
        if 'password for' in output.lower() or 'password:' in output.lower():
            lines = output.split('\n')
            output = '\n'.join([line for line in lines if not ('password' in line.lower() and ':' in line)])

        child.close()

        return {
            'success': child.exitstatus == 0,
            'output': output.strip(),
            'stderr': '',
            'returncode': child.exitstatus,
            'command': original_command
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'output': '',
            'stderr': str(e),
            'command': command
        }

def run_ssh_command_with_connection_check(command, timeout=30):
    """
    Run SSH command with automatic connection verification
    """
    # First verify SSH connection
    ssh_status = test_ssh_connection()

    if not ssh_status['success']:
        return {
            'success': False,
            'error': f"SSH connection not available: {ssh_status['error']}",
            'output': '',
            'stderr': ssh_status['error'],
            'command': command
        }

    # Execute the command
    return run_ssh_command(command, timeout)

def check_device_connection():
    """
    Check overall device connection status including SSH
    """
    try:
        # Check internet connectivity using socket instead of ping
        has_internet = test_internet_connectivity()

        # Check SSH connection
        ssh_result = test_ssh_connection()

        return {
            'connected': has_internet,
            'ssh_available': ssh_result['success'],
            'ssh_error': ssh_result.get('error') if not ssh_result['success'] else None,
            'connection_details': {
                'internet': has_internet,
                'ssh': ssh_result['success'],
                'ssh_details': ssh_result.get('details', {}),
                'timestamp': datetime.now().isoformat()
            }
        }

    except Exception as e:
        logger.error(f"Device connection check failed: {e}")
        return {
            'connected': False,
            'ssh_available': False,
            'error': str(e),
            'connection_details': {}
        }