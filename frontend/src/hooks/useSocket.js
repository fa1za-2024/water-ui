import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { io } from 'socket.io-client';

import { sensorUpdateReceived, setConnected } from '../store/slices/sensorSlice.js';

/**
 * Subscribe to the backend's Socket.io stream.
 *
 * Rule 5: live updates travel Socket.io -> Redux -> components. There is no
 * polling fallback anywhere in this app.
 *
 * The event name must match SENSOR_UPDATE_EVENT in backend/src/config/socket.js.
 *
 * @param {string} [url] Backend origin. Defaults to same-origin, which is what
 *   both the Vite dev proxy and the production nginx proxy provide.
 */
export function useSocket(url = import.meta.env.VITE_SOCKET_URL ?? window.location.origin) {
    const dispatch = useDispatch();

    useEffect(() => {
        const socket = io(url, {
            transports: ['websocket', 'polling'],
            withCredentials: true,
        });

        socket.on('connect', () => dispatch(setConnected(true)));
        socket.on('disconnect', () => dispatch(setConnected(false)));
        socket.on('sensor-update', (reading) => dispatch(sensorUpdateReceived(reading)));

        // Tear the connection down on unmount so React StrictMode's double
        // mount in development does not leave an orphaned socket behind.
        return () => {
            socket.off('sensor-update');
            socket.disconnect();
        };
    }, [url, dispatch]);
}
