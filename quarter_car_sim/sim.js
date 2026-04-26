// Tab Switching Logic
const tabs = document.querySelectorAll('.tab-icon');
tabs.forEach(t => {
    t.addEventListener('click', () => {
        tabs.forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById(`tab-${t.dataset.tab}`).classList.add('active');
    });
});

// Canvas Setup
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
    roadInputs: [
        { active: true, freq: 0, amp: 0.05, phi: 0 }
    ],
    activeDamping: false,
    posGain: 0,
    nullPoint: 0
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
const inputs = ['ms', 'mu', 'ks', 'cs', 'kt', 'ct', 'posGain', 'nullPoint'];
inputs.forEach(id => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(id + 'Val');
    el.addEventListener('input', () => {
        params[id] = parseFloat(el.value);
        valEl.textContent = el.value;
    });
});

document.getElementById('activeDamping').addEventListener('change', (e) => {
    params.activeDamping = e.target.checked;
    document.getElementById('activeControls').style.display = e.target.checked ? 'block' : 'none';
});

document.getElementById('setZeroBtn').addEventListener('click', () => {
    params.nullPoint = state.xu - state.xs;
    const el = document.getElementById('nullPoint');
    const valEl = document.getElementById('nullPointVal');
    el.value = params.nullPoint;
    valEl.textContent = params.nullPoint.toFixed(3);
});

const roadTableBody = document.getElementById('roadTableBody');
const addRoadBtn = document.getElementById('addRoadInput');

function updateRoadTable() {
    roadTableBody.innerHTML = '';
    params.roadInputs.forEach((input, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" ${input.active ? 'checked' : ''} class="road-active" data-index="${index}"></td>
            <td><input type="number" value="${input.freq}" step="0.1" min="0" max="50" class="road-freq" data-index="${index}" style="width: 50px;"></td>
            <td><input type="number" value="${(input.amp * 100).toFixed(1)}" step="0.5" min="0" max="50" class="road-amp" data-index="${index}" style="width: 50px;"></td>
            <td><button class="remove-road" data-index="${index}" style="padding: 2px 5px; background: #dc3545; color: #fff; border: none; font-size: 0.8em; cursor: pointer;">&times;</button></td>
        `;
        roadTableBody.appendChild(row);
    });
}

roadTableBody.addEventListener('change', (e) => {
    const idx = parseInt(e.target.dataset.index);
    if (e.target.classList.contains('road-active')) {
        params.roadInputs[idx].active = e.target.checked;
    } else if (e.target.classList.contains('road-freq')) {
        const newVal = parseFloat(e.target.value);
        const oldFreq = params.roadInputs[idx].freq;
        params.roadInputs[idx].phi = 2 * Math.PI * (oldFreq - newVal) * state.time + params.roadInputs[idx].phi;
        params.roadInputs[idx].freq = newVal;
    } else if (e.target.classList.contains('road-amp')) {
        params.roadInputs[idx].amp = parseFloat(e.target.value) / 100; // Convert cm to m
    }
});

roadTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-road')) {
        const idx = parseInt(e.target.dataset.index);
        params.roadInputs.splice(idx, 1);
        updateRoadTable();
    }
});

addRoadBtn.addEventListener('click', () => {
    params.roadInputs.push({ active: true, freq: 1.0, amp: 0.05, phi: 0 });
    updateRoadTable();
});

updateRoadTable();

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
    state = { xs: 0, vs: 0, xu: 0, vu: 0, xr: 0, vr: 0, time: 0 };
    bumpStartTime = -100;
});

// Save / Load / Export / Import
const presetsList = document.getElementById('presetsList');
const configNameInput = document.getElementById('configName');

// Recording logic
let isRecording = false;
let currentRecording = [];
const recordingsList = document.getElementById('recordingsList');
const recordBtn = document.getElementById('recordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');

function getRecordings() {
    const saved = localStorage.getItem('suspension_sim_recordings');
    return saved ? JSON.parse(saved) : {};
}

function updateRecordingsUI() {
    const recordings = getRecordings();
    recordingsList.innerHTML = '';
    Object.keys(recordings).forEach(name => {
        const item = document.createElement('div');
        item.style = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; background: #fdfdfd; padding: 4px; border: 1px solid #eee;';
        item.innerHTML = `
            <span style="color: var(--primary); font-weight: 600;">${name} (${recordings[name].length} pts)</span>
            <div style="display:flex; gap:5px;">
                <button class="dl-rec" data-name="${name}" style="background: #28a745; color: white; border: none; padding: 2px 5px; cursor: pointer;">CSV</button>
                <button class="delete-rec" data-name="${name}" style="background: #dc3545; color: white; border: none; padding: 2px 5px; cursor: pointer;">&times;</button>
            </div>
        `;
        item.querySelector('.dl-rec').addEventListener('click', () => {
            const data = recordings[name];
            let csv = 'Time,BodyPos,TirePos,RoadPos,RelVel\n';
            data.forEach(row => {
                csv += `${row.t},${row.xs},${row.xu},${row.xr},${row.vu - row.vs}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', `${name}.csv`);
            a.click();
        });
        item.querySelector('.delete-rec').addEventListener('click', () => {
            const recs = getRecordings();
            delete recs[name];
            localStorage.setItem('suspension_sim_recordings', JSON.stringify(recs));
            updateRecordingsUI();
        });
        recordingsList.appendChild(item);
    });
}

recordBtn.addEventListener('click', () => {
    isRecording = true;
    currentRecording = [];
    recordBtn.disabled = true;
    stopRecordBtn.disabled = false;
    recordBtn.textContent = 'Recording...';
});

stopRecordBtn.addEventListener('click', () => {
    isRecording = false;
    recordBtn.disabled = false;
    stopRecordBtn.disabled = true;
    recordBtn.textContent = 'Record';
    
    if (currentRecording.length > 0) {
        const name = prompt('Enter a name for this recording:', `Run ${new Date().toLocaleTimeString()}`);
        if (name) {
            const recs = getRecordings();
            recs[name] = currentRecording;
            localStorage.setItem('suspension_sim_recordings', JSON.stringify(recs));
            updateRecordingsUI();
        }
    }
});

updateRecordingsUI();

function getPresets() {
    const saved = localStorage.getItem('suspension_sim_presets');
    return saved ? JSON.parse(saved) : {};
}

function updatePresetsUI() {
    const presets = getPresets();
    presetsList.innerHTML = '';
    Object.keys(presets).forEach(name => {
        const item = document.createElement('div');
        item.style = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-size: 0.8em; background: #fdfdfd; padding: 4px; border-radius: 4px; border: 1px solid #eee;';
        item.innerHTML = `
            <span style="cursor: pointer; color: var(--primary); font-weight: 600; flex-grow: 1;">${name}</span>
            <button class="delete-preset" data-name="${name}" style="background: none; color: #dc3545; border: none; cursor: pointer; padding: 0 5px; font-weight: bold;">&times;</button>
        `;
        item.querySelector('span').addEventListener('click', () => {
            Object.assign(params, presets[name]);
            updateUIFromParams();
        });
        item.querySelector('.delete-preset').addEventListener('click', (e) => {
            const presets = getPresets();
            delete presets[e.target.dataset.name];
            localStorage.setItem('suspension_sim_presets', JSON.stringify(presets));
            updatePresetsUI();
        });
        presetsList.appendChild(item);
    });
}

document.getElementById('saveBtn').addEventListener('click', () => {
    const name = configNameInput.value.trim();
    if (!name) {
        alert('Please enter a name for the preset.');
        return;
    }
    const presets = getPresets();
    presets[name] = JSON.parse(JSON.stringify(params)); // Deep copy
    localStorage.setItem('suspension_sim_presets', JSON.stringify(presets));
    configNameInput.value = '';
    updatePresetsUI();
});

updatePresetsUI();

document.getElementById('exportBtn').addEventListener('click', () => {
    const json = JSON.stringify(params, null, 2);
    navigator.clipboard.writeText(json).then(() => {
        alert('Configuration copied to clipboard as JSON!');
    });
});

document.getElementById('importBtn').addEventListener('click', () => {
    const str = prompt('Paste your Exported JSON here:');
    if (str) {
        try {
            const data = JSON.parse(str);
            Object.assign(params, data);
            updateUIFromParams();
        } catch (e) {
            alert('Invalid JSON format.');
        }
    }
});

function updateUIFromParams() {
    inputs.forEach(id => {
        const el = document.getElementById(id);
        const valEl = document.getElementById(id + 'Val');
        if (el) el.value = params[id];
        if (valEl) valEl.textContent = params[id];
    });
    document.getElementById('activeDamping').checked = params.activeDamping;
    document.getElementById('activeControls').style.display = params.activeDamping ? 'block' : 'none';
    updateRoadTable();
}

// Road and Trace settings
const roadSpeed = 200; // pixels per second
const stateHistory = [];
const maxHistoryTime = 4; // seconds

function getRoadInput(t) {
    let road = 0;
    // Sum of all active sine waves
    params.roadInputs.forEach(input => {
        if (input.active && input.freq > 0) {
            road += input.amp * Math.sin(2 * Math.PI * input.freq * t + input.phi);
        }
    });

    // One off bump (half sine wave)
    const bumpDuration = 0.5; // seconds
    if (t >= bumpStartTime && t <= bumpStartTime + bumpDuration) {
        road += 0.1 * Math.sin(Math.PI * (t - bumpStartTime) / bumpDuration);
    }
    return road;
}

function getRoadVelocity(t) {
    let v_road = 0;
    params.roadInputs.forEach(input => {
        if (input.active && input.freq > 0) {
            v_road += input.amp * (2 * Math.PI * input.freq) * Math.cos(2 * Math.PI * input.freq * t + input.phi);
        }
    });

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
        const travel = state.xu - state.xs;
        const relVel = state.vu - state.vs;
        
        let dampingCoeff = params.cs;
        if (params.activeDamping) {
            // Damping base + (Gain * |distance from null point|)
            const deviation = Math.abs(travel - params.nullPoint);
            dampingCoeff += params.posGain * deviation;
        }

        const Fs = params.ks * travel + dampingCoeff * relVel;
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
    
    // Logic for persistent recording
    if (isRecording) {
        currentRecording.push({ t: state.time, xs: state.xs, xu: state.xu, xr: state.xr, vs: state.vs, vu: state.vu });
    }

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
            ctx.lineWidth = 1.5;
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
            drawTrace(h => h.xu, 'rgba(148, 163, 184, 0.5)', [5, 2], 50);
        
        if (traceToggles.xs.checked) 
            drawTrace(h => h.xs, 'rgba(56, 189, 248, 0.6)', [], -70);

        if (traceToggles.trav.checked)
            drawTrace(h => h.xu - h.xs, 'rgba(74, 222, 128, 0.5)', [], -150);

        if (traceToggles.vel.checked)
            drawTrace(h => h.vu - h.vs, 'rgba(251, 146, 60, 0.5)', [], -220, 0.2); // Scaled vel
    }

    // Draw grid
    ctx.strokeStyle = '#f1f1f1';
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
    for (let i = stateHistory.length - 1; i >= 0; i--) {
        const h = stateHistory[i];
        const x = centerX - (state.time - h.t) * roadSpeed;
        if (x < 0) continue; 
        
        const roadY = centerY + 100 - h.xr * scale;
        if (!started) {
            ctx.moveTo(x, roadY);
            started = true;
        } else {
            ctx.lineTo(x, roadY);
        }
    }

    // 2. Future road (to the right of the car)
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

    ctx.strokeStyle = '#6c757d';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.stroke();

    // Ground area (filling beneath road)
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.fillStyle = 'rgba(108, 117, 125, 0.05)';
    ctx.fill();

    // Ground line (reference)
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, centerY + 100);
    ctx.lineTo(canvas.width, centerY + 100);
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // --- DRAWING COMPONENTS ---
    const tireY = centerY + 50 - state.xu * scale;
    const bodyY = centerY - 100 - state.xs * scale;
    const roadY = centerY + 100 - state.xr * scale;

    // 1. Suspension Assembly (Spring & Damper)
    const springTop = bodyY + 60;
    const springBottom = tireY - 40;
    const springHeight = springBottom - springTop;
    const springWidth = 40;
    const coils = 12;

    // Damper Outer Body (Bottom Part)
    ctx.fillStyle = '#495057';
    ctx.beginPath();
    ctx.roundRect(centerX - 8, springBottom - springHeight * 0.6, 16, springHeight * 0.6, 2);
    ctx.fill();

    // Damper Rod (Top Part, sliding into body)
    ctx.strokeStyle = '#adb5bd';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(centerX, springTop);
    ctx.lineTo(centerX, springBottom - springHeight * 0.4);
    ctx.stroke();

    // Spring (Coiled around the damper)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(108, 117, 125, 0.8)';
    ctx.lineWidth = 4;
    ctx.moveTo(centerX, springTop);
    for (let i = 0; i <= coils; i++) {
        const y = springTop + (i / coils) * springHeight;
        // The sine wave creates the 3D look of a coil
        const xOffset = Math.sin((i / coils) * Math.PI * coils) * (springWidth / 2);
        if (i === 0) ctx.moveTo(centerX + xOffset, y);
        else ctx.lineTo(centerX + xOffset, y);
    }
    ctx.stroke();

    // 2. Unsprung Mass (Tire)
    // Tire Rubber
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(centerX, tireY, 40, 0, Math.PI * 2);
    ctx.fill();
    
    // Rim / Wheel Center
    ctx.fillStyle = '#adb5bd';
    ctx.beginPath();
    ctx.arc(centerX, tireY, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#495057';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Wheel Bolts (Detail)
    ctx.fillStyle = '#495057';
    for(let i=0; i<5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(centerX + Math.cos(ang)*10, tireY + Math.sin(ang)*10, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // 3. Sprung Mass (Car Body - simplified chassis look)
    ctx.fillStyle = '#007bff';
    ctx.beginPath();
    ctx.roundRect(centerX - 60, bodyY, 120, 60, 5);
    ctx.fill();
    ctx.strokeStyle = '#0056b3';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Window/Detail
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(centerX - 50, bodyY + 10, 40, 20);

    // 4. Tire Linkage (Visual Tension)
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(centerX, tireY + 40);
    ctx.lineTo(centerX, roadY);
    ctx.strokeStyle = '#495057';
    ctx.stroke();
    ctx.setLineDash([]);

    // Text info HUD
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.roundRect(20, 20, 240, 160, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(222, 226, 230, 1)';
    ctx.stroke();

    ctx.fillStyle = '#212529';
    ctx.font = 'bold 11px "Inter", sans-serif';
    ctx.fillText('LIVE TELEMETRY', 35, 45);
    
    ctx.font = '12px monospace';
    const lines = [
        [`BODY DISP:`, `${(state.xs * 100).toFixed(2)}cm`],
        [`TIRE DISP:`, `${(state.xu * 100).toFixed(2)}cm`],
        [`SUSP TRAVEL:`, `${((state.xu - state.xs) * 100).toFixed(2)}cm`],
        [`GAP DIST:`, `${((0.3 + state.xs - state.xu) * 100).toFixed(1)}cm`],
        [`REL VEL:`, `${(state.vu - state.vs).toFixed(2)}m/s`],
        [`ROAD HEIGHT:`, `${(state.xr * 100).toFixed(2)}cm`]
    ];

    lines.forEach((line, i) => {
        ctx.fillStyle = '#6c757d';
        ctx.fillText(line[0], 35, 70 + i * 18);
        ctx.fillStyle = '#007bff';
        ctx.fillText(line[1], 160, 70 + i * 18);
    });

    requestAnimationFrame(() => {
        update();
        draw();
    });
}

draw();
