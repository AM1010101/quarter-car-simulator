const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// Simulation parameters
let params = {
    ms: 300,    // Sprung mass
    mu: 40,     // Unsprung mass
    ks: 20000,  // Suspension stiffness
    cs: 1500,   // Suspension damping
    kt: 200000, // Tire stiffness
    ct: 1000,   // Tire damping
    freq: 0,    // Road input frequency
    amp: 0.05,  // Road input amplitude
    phi: 0      // Accumulator for phase matching
};

// Simulation state
let state = {
    xs: 0,      // Sprung mass position (relative to equilibrium)
    vs: 0,      // Sprung mass velocity
    xu: 0,      // Unsprung mass position (relative to equilibrium)
    vu: 0,      // Unsprung mass velocity
    xr: 0,      // Road position
    vr: 0,      // Road velocity
    time: 0
};

// UI Elements
const inputs = ['ms', 'mu', 'ks', 'cs', 'kt', 'ct', 'freq', 'amp'];
inputs.forEach(id => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(id + 'Val');
    el.addEventListener('input', () => {
        const newVal = parseFloat(el.value);
        if (id === 'freq' && params.freq !== newVal) {
            // Adjust phase accumulator to maintain continuity:
            // Old: sin(2pi*f_old*t + phi_old)
            // New: sin(2pi*f_new*t + phi_new)
            // To match at current state.time:
            // 2pi*f_old*t + phi_old = 2pi*f_new*t + phi_new
            // phi_new = 2pi*(f_old - f_new)*t + phi_old
            params.phi = 2 * Math.PI * (params.freq - newVal) * state.time + params.phi;
        }
        params[id] = newVal;
        valEl.textContent = el.value;
    });
});

let showTraces = true;
document.getElementById('showTraces').addEventListener('change', (e) => {
    showTraces = e.target.checked;
});

const traceToggles = {
    xs: document.getElementById('trace-xs'),
    xu: document.getElementById('trace-xu'),
    trav: document.getElementById('trace-trav'),
    vel: document.getElementById('trace-vel')
};

let bumpStartTime = -100;
document.getElementById('bumpBtn').addEventListener('click', () => {
    bumpStartTime = state.time;
});

let simSpeed = 1.0;
const speedBtns = document.querySelectorAll('.speed-btn');
speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        simSpeed = parseFloat(btn.dataset.speed);
        speedBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

document.getElementById('resetBtn').addEventListener('click', () => {
    state = { xs: 0, vs: 0, xu: 0, vu: 0, xr: 0, time: 0 };
    bumpStartTime = -100;
});

// Road and Trace settings
const roadSpeed = 200; // pixels per second
const stateHistory = [];
const maxHistoryTime = 4; // seconds

function getRoadInput(t) {
    let road = 0;
    // Continuous sine wave with phase accumulator
    if (params.freq > 0) {
         road += params.amp * Math.sin(2 * Math.PI * params.freq * t + params.phi);
    }
    // One off bump (half sine wave)
    const bumpDuration = 0.5; // seconds
    if (t >= bumpStartTime && t <= bumpStartTime + bumpDuration) {
        road += 0.1 * Math.sin(Math.PI * (t - bumpStartTime) / bumpDuration);
    }
    return road;
}

function getRoadVelocity(t) {
    let v_road = 0;
    if (params.freq > 0) {
        v_road += params.amp * (2 * Math.PI * params.freq) * Math.cos(2 * Math.PI * params.freq * t + params.phi);
    }
    const bumpDuration = 0.5;
    if (t >= bumpStartTime && t <= bumpStartTime + bumpDuration) {
        v_road += 0.1 * (Math.PI / bumpDuration) * Math.cos(Math.PI * (t - bumpStartTime) / bumpDuration);
    }
    return v_road;
}

const dt = 1/240; // Internal step - higher precision
const stepsPerFrame = 4; // Higher sub-stepping for stability at 1/240s total

function update() {
    if (simSpeed === 0) return;

    // We adjust currentDt based on simSpeed to slow down time
    const frameDt = dt * simSpeed; 
    
    for (let i = 0; i < stepsPerFrame; i++) {
        const t = state.time;
        const currentDt = frameDt / stepsPerFrame;

        const xr = getRoadInput(t);
        const vr = getRoadVelocity(t);
        state.xr = xr;

        // Forces
        // Suspension force: Fs = ks * (xu - xs) + cs * (vu - vs)
        const Fs = params.ks * (state.xu - state.xs) + params.cs * (state.vu - state.vs);
        // Tire force: Ft = kt * (xr - xu) + ct * (vr - vu)
        const Ft = params.kt * (state.xr - state.xu) + params.ct * (vr - state.vu);

        // Accelerations
        const as = Fs / params.ms;
        const au = (Ft - Fs) / params.mu;

        // Integration (Euler-Cromer)
        state.vs += as * currentDt;
        state.xs += state.vs * currentDt;
        state.vu += au * currentDt;
        state.xu += state.vu * currentDt;

        state.time += currentDt;
    }

    // Update history for traces
    stateHistory.unshift({ t: state.time, xs: state.xs, xu: state.xu, xr: state.xr, vs: state.vs, vu: state.vu });
    
    // Purge old history
    const cutoffTime = state.time - maxHistoryTime;
    while (stateHistory.length > 0 && stateHistory[stateHistory.length - 1].t < cutoffTime) {
        stateHistory.pop();
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width * 0.7; // Car horizontal position
    const centerY = canvas.height / 2 + 80;
    const scale = 600; // Slightly larger scale for better visualization

    // Traces logic
    if (showTraces) {
        // Function to draw a history trace
        const drawTrace = (getter, color, dash = [], yOffset = 0, autoScale = 1) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.setLineDash(dash);
            let first = true;
            for (let i = 0; i < stateHistory.length; i++) {
                const h = stateHistory[i];
                const x = centerX - (state.time - h.t) * roadSpeed;
                if (x < 0) break;
                const y = centerY + yOffset - getter(h) * scale * autoScale;
                if (first) {
                    ctx.moveTo(x, y);
                    first = false;
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.setLineDash([]);
        };

        if (traceToggles.xu.checked) 
            drawTrace(h => h.xu, 'rgba(51, 51, 51, 0.4)', [5, 2], 50);
        
        if (traceToggles.xs.checked) 
            drawTrace(h => h.xs, 'rgba(0, 123, 255, 0.4)', [], -70);

        if (traceToggles.trav.checked)
            drawTrace(h => h.xu - h.xs, 'rgba(40, 167, 69, 0.6)', [], -150);

        if (traceToggles.vel.checked)
            drawTrace(h => h.vu - h.vs, 'rgba(253, 126, 20, 0.6)', [], -220, 0.2); // Scaled vel
    }

    // Draw grid
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    for(let i=0; i<canvas.width; i+=50) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for(let i=0; i<canvas.height; i+=50) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Road rendering - one continuous path from left to right
    ctx.beginPath();
    
    let started = false;

    // 1. Past road (to the left of the car) - frozen historical data
    // Iterate backwards from the oldest available history to the newest (at the car)
    for (let i = stateHistory.length - 1; i >= 0; i--) {
        const h = stateHistory[i];
        const x = centerX - (state.time - h.t) * roadSpeed;
        if (x < 0) continue; // Skip points off-screen to the left
        
        const roadY = centerY + 100 - h.xr * scale;
        if (!started) {
            ctx.moveTo(x, roadY);
            started = true;
        } else {
            ctx.lineTo(x, roadY);
        }
    }

    // 2. Future road (to the right of the car) - depends on current sliders
    // Continue from the last point (which is roughly centerX) to the right edge
    const startX = started ? Math.floor(centerX) + 1 : 0;
    for (let x = startX; x <= canvas.width; x++) {
        const tAtX = state.time + (x - centerX) / roadSpeed;
        const roadY = centerY + 100 - getRoadInput(tAtX) * scale;
        if (!started) {
            ctx.moveTo(x, roadY);
            started = true;
        } else {
            ctx.lineTo(x, roadY);
        }
    }

    ctx.strokeStyle = '#666';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.stroke();

    // Ground line (reference)
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, centerY + 100);
    ctx.lineTo(canvas.width, centerY + 100);
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // Unsprung Mass (Tire/Axle)
    const tireY = centerY + 50 - state.xu * scale;
    ctx.fillStyle = '#333';
    ctx.fillRect(centerX - 30, tireY - 20, 60, 40);
    ctx.strokeRect(centerX - 30, tireY - 20, 60, 40);

    // Sprung Mass (Car Body)
    const bodyY = centerY - 100 - state.xs * scale;
    ctx.fillStyle = '#007bff';
    ctx.fillRect(centerX - 50, bodyY, 100, 60);
    ctx.strokeRect(centerX - 50, bodyY, 100, 60);

    // Suspension Link
    ctx.beginPath();
    ctx.moveTo(centerX, bodyY + 60);
    ctx.lineTo(centerX, tireY);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tire Link
    ctx.beginPath();
    ctx.moveTo(centerX, tireY + 40);
    ctx.lineTo(centerX, centerY + 100 - state.xr * scale);
    ctx.strokeStyle = '#999';
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Text info
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(10, 10, 220, 140);
    ctx.strokeStyle = '#ddd';
    ctx.strokeRect(10, 10, 220, 140);

    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px "Courier New", Courier, monospace';
    const lines = [
        [`BODY DISP:`, `${(state.xs).toFixed(3)} m`],
        [`TIRE DISP:`, `${(state.xu).toFixed(3)} m`],
        [`SUSP TRAVEL:`, `${(state.xu - state.xs).toFixed(3)} m`],
        [`GAP DIST:`, `${(0.3 + state.xs - state.xu).toFixed(3)} m`],
        [`REL VEL:`, `${(state.vu - state.vs).toFixed(2)} m/s`],
        [`ROAD H:`, `${(state.xr).toFixed(3)} m`]
    ];

    lines.forEach((line, i) => {
        ctx.fillStyle = '#666';
        ctx.fillText(line[0], 25, 30 + i * 20);
        ctx.fillStyle = '#007bff';
        ctx.fillText(line[1], 140, 30 + i * 20);
    });

    requestAnimationFrame(() => {
        update();
        draw();
    });
}

draw();
