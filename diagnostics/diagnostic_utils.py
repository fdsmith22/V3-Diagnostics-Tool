"""
Utility functions for diagnostic modules
"""
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from utils.ssh_interface import run_ssh_command as _run_ssh_command

def run_diagnostic_command(command: str, timeout: int = 30) -> str:
    """
    Run an SSH command with increased timeout for diagnostics.
    Default timeout is 30 seconds instead of 10.
    """
    return _run_ssh_command(command, timeout=timeout)

# Alias for backward compatibility
run_ssh_command = run_diagnostic_command