# Persistent SSH Connection

## Overview

The V3 Diagnostics Tool now supports persistent SSH connections using paramiko, which provides better performance and reduced latency compared to spawning new SSH processes for each command.

## Architecture

### Lazy Initialization
The persistent SSH connection uses lazy initialization to prevent blocking Flask startup:
- Connection is NOT established on module import
- First SSH command triggers connection establishment
- Connection is reused for subsequent commands
- Automatic reconnection on connection failures

### Thread Safety
- Uses threading locks to ensure thread-safe access
- Multiple Flask workers can safely share the connection
- Connection state is properly synchronized

### Fallback Mechanism
If persistent SSH fails, the system automatically falls back to subprocess-based SSH:
```python
# In utils/ssh_interface.py
if USE_PERSISTENT and _persistent_ssh_command:
    try:
        return _persistent_ssh_command(command, timeout=timeout)
    except Exception as e:
        logger.warning(f"Persistent SSH failed, falling back to subprocess: {e}")
# Falls back to subprocess method...
```

## Configuration

The SSH connection uses the same environment variables as before:
- `SSH_USER`: SSH username (default: ubuntu)
- `SSH_IP`: Target device IP (default: 192.168.55.1)
- `SSH_PASSWORD`: SSH password (required)
- `SSH_PORT`: SSH port (default: 22)

## Benefits

1. **Performance**: Reuses connection, reducing overhead
2. **Reliability**: Built-in keepalive prevents timeout
3. **Features**: Better error handling and PTY support
4. **Compatibility**: Seamless fallback to subprocess method

## Testing

To test the persistent SSH connection:
```bash
python test_persistent_ssh.py
```

## Monitoring

Check logs for connection status:
```bash
grep "SSH connection" app.log
```

## Troubleshooting

If Flask startup hangs:
1. Check if paramiko is trying to connect during import
2. Verify lazy initialization is working
3. Check for blocking operations in module init

If connections fail:
1. Verify SSH credentials in .env
2. Check device is reachable
3. Look for firewall issues
4. Review paramiko debug logs