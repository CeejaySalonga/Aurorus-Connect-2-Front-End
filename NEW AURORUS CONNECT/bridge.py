import asyncio
import json
import sys

# Requires: pip install pyscard websockets
try:
    from smartcard.System import readers
    from smartcard.util import toHexString
    import websockets
except Exception as e:
    print("Missing dependency:", e)
    print("Install with: py -m pip install pyscard websockets")
    sys.exit(1)


class PcscSession:
    def __init__(self):
        self.connection = None
        self.reader = None

    def list_readers(self):
        try:
            return [str(r) for r in readers()]
        except Exception:
            return []

    def connect(self, index: int = 0, wait: bool = False, timeout_s: int = 30):
        rs = readers()
        if not rs:
            raise RuntimeError('No PC/SC readers found')
        if index < 0 or index >= len(rs):
            raise RuntimeError('Reader index out of range')
        self.reader = rs[index]
        self.connection = self.reader.createConnection()
        if not wait:
            self.connection.connect()
            atr = self.connection.getATR()
            return bytes(atr)
        # Wait for a card (phone) to be present up to timeout
        import time
        deadline = time.time() + timeout_s
        last_err = None
        while time.time() < deadline:
            try:
                self.connection.connect()
                atr = self.connection.getATR()
                return bytes(atr)
            except Exception as e:
                last_err = e
                time.sleep(0.5)
        raise RuntimeError(f'Card not present within {timeout_s}s: {last_err}')

    def disconnect(self):
        if self.connection:
            try:
                self.connection.disconnect()
            except Exception:
                pass
        self.connection = None
        self.reader = None

    def transmit(self, apdu: bytes):
        if not self.connection:
            raise RuntimeError('Not connected')
        data, sw1, sw2 = self.connection.transmit(list(apdu))
        return bytes(data) + bytes([sw1, sw2])


async def handler(websocket):
    session = PcscSession()
    async for message in websocket:
        try:
            req = json.loads(message)
            cmd = req.get('cmd')
            if cmd == 'list':
                r = session.list_readers()
                await websocket.send(json.dumps({'ok': True, 'readers': r}))
            elif cmd == 'connect':
                idx = int(req.get('index', 0))
                wait = bool(req.get('wait', True))
                atr = session.connect(idx, wait=wait)
                await websocket.send(json.dumps({'ok': True, 'atr': atr.hex().upper()}))
            elif cmd == 'disconnect':
                session.disconnect()
                await websocket.send(json.dumps({'ok': True}))
            elif cmd == 'xfr':
                apdu_hex = req.get('apdu', '')
                apdu = bytes.fromhex(apdu_hex)
                resp = session.transmit(apdu)
                await websocket.send(json.dumps({'ok': True, 'rapdu': resp.hex().upper()}))
            else:
                await websocket.send(json.dumps({'ok': False, 'error': 'unknown cmd'}))
        except Exception as e:
            await websocket.send(json.dumps({'ok': False, 'error': str(e)}))


async def main():
    port = 8765
    print(f"Starting NFC bridge on ws://localhost:{port}")
    async with websockets.serve(handler, '127.0.0.1', port, ping_interval=20, ping_timeout=20):
        await asyncio.Future()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass


