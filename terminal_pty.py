#!/usr/bin/env python3
"""
PTY-based terminal backend for real terminal experience
"""
import os
import pty
import select
import subprocess
import termios
import struct
import fcntl
import signal
from flask_socketio import emit
import logging

logger = logging.getLogger(__name__)

class PtyProcess:
    def __init__(self, socketio, session_id):
        self.socketio = socketio
        self.session_id = session_id
        self.fd = None
        self.pid = None
        self.running = False
        
    def start(self, command=None, ssh_config=None):
        """Start a PTY process"""
        if command is None:
            if ssh_config:
                # SSH to remote device
                command = [
                    'ssh',
                    '-o', 'StrictHostKeyChecking=no',
                    '-o', 'UserKnownHostsFile=/dev/null',
                    f"{ssh_config['user']}@{ssh_config['host']}"
                ]
            else:
                # Local shell
                command = [os.environ.get('SHELL', '/bin/bash')]
        
        # Create PTY
        pid, fd = pty.fork()
        
        if pid == 0:
            # Child process
            os.execvp(command[0], command)
        else:
            # Parent process
            self.pid = pid
            self.fd = fd
            self.running = True
            
            # Set non-blocking
            flags = fcntl.fcntl(self.fd, fcntl.F_GETFL)
            fcntl.fcntl(self.fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
            
            # Start reading output
            self.socketio.start_background_task(self._read_loop)
            
            logger.info(f"PTY started for session {self.session_id}, PID: {pid}")
            
    def _read_loop(self):
        """Read output from PTY and send to client"""
        max_read_size = 4096
        
        while self.running:
            try:
                # Check if data is available
                r, _, _ = select.select([self.fd], [], [], 0.1)
                
                if r:
                    try:
                        output = os.read(self.fd, max_read_size)
                        if output:
                            # Send to specific session
                            self.socketio.emit(
                                'pty_output',
                                {'output': output.decode('utf-8', errors='replace')},
                                room=self.session_id
                            )
                    except OSError:
                        # PTY closed
                        break
                        
            except Exception as e:
                logger.error(f"PTY read error: {e}")
                break
        
        self.stop()
        
    def write(self, data):
        """Write data to PTY"""
        if self.fd and self.running:
            try:
                os.write(self.fd, data.encode('utf-8'))
            except Exception as e:
                logger.error(f"PTY write error: {e}")
                
    def resize(self, rows, cols):
        """Resize PTY window"""
        if self.fd and self.running:
            try:
                # Get window size struct
                winsize = struct.pack('HHHH', rows, cols, 0, 0)
                fcntl.ioctl(self.fd, termios.TIOCSWINSZ, winsize)
            except Exception as e:
                logger.error(f"PTY resize error: {e}")
                
    def stop(self):
        """Stop PTY process"""
        self.running = False
        
        if self.pid:
            try:
                os.kill(self.pid, signal.SIGTERM)
                os.waitpid(self.pid, 0)
            except:
                pass
                
        if self.fd:
            try:
                os.close(self.fd)
            except:
                pass
                
        logger.info(f"PTY stopped for session {self.session_id}")


class TerminalManager:
    """Manages multiple terminal sessions"""
    
    def __init__(self, socketio):
        self.socketio = socketio
        self.sessions = {}
        
    def create_session(self, session_id, ssh_config=None):
        """Create a new terminal session"""
        if session_id in self.sessions:
            self.close_session(session_id)
            
        session = PtyProcess(self.socketio, session_id)
        session.start(ssh_config=ssh_config)
        self.sessions[session_id] = session
        
        return session
        
    def get_session(self, session_id):
        """Get an existing session"""
        return self.sessions.get(session_id)
        
    def close_session(self, session_id):
        """Close a terminal session"""
        if session_id in self.sessions:
            self.sessions[session_id].stop()
            del self.sessions[session_id]
            
    def close_all_sessions(self):
        """Close all sessions"""
        for session_id in list(self.sessions.keys()):
            self.close_session(session_id)