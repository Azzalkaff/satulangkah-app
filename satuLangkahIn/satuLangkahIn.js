
        

        // --- STATE APLIKASI ---
        let currentTask = "";
        let steps = []; // Menyimpan objek { action: "...", duration: X }
        let currentStepIndex = 0;
        let currentMode = "direct"; // Default: direct (Mode Langsung)
        
        // State Timer
        let timerInterval = null;
        let timeLeft = 0; // dalam detik
        let timeElapsed = 0; // durasi yang sudah berlalu
        let totalTimeSec = 0; // total waktu step dalam detik
        let isTimerRunning = false;
        let isTimerVisible = true;
        let isCountUp = false; // flag mode perhitungan

        // State Audio (Web Audio API)
        let audioCtx = null;
        let brownNoiseNode = null;
        let brownNoiseGain = null;
        let playChimeOnEnd = true;
        let isBrownNoiseMuted = localStorage.getItem('is_brown_noise_muted') === 'true'; // preferences saved

        // In-Memory Rutinitas (disimpan di LocalStorage agar bertahan)
        let routines = JSON.parse(localStorage.getItem('user_routines')) || [
            { id: 1, text: "Bereskan meja kerja" },
            { id: 2, text: "Sortir & balas 3 email darurat" }
        ];

        // --- INISIALISASI INDEXEDDB (LOG RIWAYAT) ---
        let db;
        const DB_NAME = "SatuLangkahDB";
        const STORE_NAME = "task_logs";

        function initIndexedDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = (event) => {
                    const database = event.target.result;
                    if (!database.objectStoreNames.contains(STORE_NAME)) {
                        database.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                    }
                };
                request.onsuccess = (event) => {
                    db = event.target.result;
                    resolve(db);
                };
                request.onerror = (event) => {
                    console.error("IndexedDB Error:", event.target.errorCode);
                    reject(event.target.errorCode);
                };
            });
        }

        // Simpan log kemenangan kecil
        function addLogToDB(taskTitle, stepsCount) {
            if (!db) return;
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const dateStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
            
            // Batasi panjang judul log agar tetap rapi
            const truncatedTitle = taskTitle.length > 50 ? taskTitle.substring(0, 50) + "..." : taskTitle;

            const logItem = {
                title: truncatedTitle,
                steps: stepsCount,
                timestamp: dateStr
            };
            store.add(logItem);
        }

        // Ambil data log
        function loadLogsFromDB() {
            const container = document.getElementById('history-container');
            container.innerHTML = '';

            if (!db) {
                container.innerHTML = '<p class="text-xs opacity-50 text-center py-2">Database tidak siap.</p>';
                return;
            }

            const transaction = db.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const logs = request.result;
                if (logs.length === 0) {
                    container.innerHTML = '<p class="text-xs opacity-50 text-center py-4">Belum ada catatan kemenangan. Selesaikan tugas pertamamu!</p>';
                    return;
                }

                // Render log secara terbalik (terbaru di atas)
                logs.reverse().forEach(log => {
                    const div = document.createElement('div');
                    div.className = "flex justify-between items-center p-2.5 bg-[#FDFBF7] border border-[#E6DFD3] rounded-xl text-xs";
                    div.innerHTML = `
                        <div class="flex-1 min-w-0 pr-2">
                            <p class="font-semibold truncate">${log.title}</p>
                            <p class="text-[10px] opacity-50">${log.timestamp} • ${log.steps} Langkah Mikro</p>
                        </div>
                        <button onclick="deleteSingleLog(${log.id})" class="text-red-400 hover:text-red-600 p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    `;
                    container.appendChild(div);
                });
            };
        }

        function deleteSingleLog(id) {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            store.delete(id);
            transaction.oncomplete = () => {
                loadLogsFromDB();
            };
        }

        // --- CUSTOM DIALOG BOX (BEBAS ALERT / CONFIRM) ---
        function showCustomAlert(title, message, onOk = null) {
            const dialog = document.getElementById('custom-dialog');
            document.getElementById('dialog-title').innerText = title;
            document.getElementById('dialog-message').innerText = message;
            
            const btnContainer = document.getElementById('dialog-buttons');
            btnContainer.innerHTML = '';

            const okBtn = document.createElement('button');
            okBtn.className = "px-6 py-2 bg-[#8E9B79] text-white text-sm font-semibold rounded-xl hover:bg-[#7A8765] transition-colors focus:outline-none";
            okBtn.innerText = "OK";
            okBtn.onclick = () => {
                dialog.classList.add('hidden');
                if (onOk) onOk();
            };
            
            btnContainer.appendChild(okBtn);
            dialog.classList.remove('hidden');
        }

        function showCustomConfirm(title, message, onConfirm, onCancel = null) {
            const dialog = document.getElementById('custom-dialog');
            document.getElementById('dialog-title').innerText = title;
            document.getElementById('dialog-message').innerText = message;
            
            const btnContainer = document.getElementById('dialog-buttons');
            btnContainer.innerHTML = '';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = "px-5 py-2 bg-[#E6DFD3] text-[#4A3F35] text-sm font-semibold rounded-xl hover:bg-[#D1C7BD] transition-colors focus:outline-none";
            cancelBtn.innerText = "Batal";
            cancelBtn.onclick = () => {
                dialog.classList.add('hidden');
                if (onCancel) onCancel();
            };

            const confirmBtn = document.createElement('button');
            confirmBtn.className = "px-5 py-2 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 transition-colors focus:outline-none";
            confirmBtn.innerText = "Hapus";
            confirmBtn.onclick = () => {
                dialog.classList.add('hidden');
                if (onConfirm) onConfirm();
            };
            
            btnContainer.appendChild(cancelBtn);
            btnContainer.appendChild(confirmBtn);
            dialog.classList.remove('hidden');
        }

        function clearHistoryLog() {
            showCustomConfirm(
                "Hapus Riwayat", 
                "Apakah kamu yakin ingin menghapus semua daftar kemenangan kecilmu?", 
                () => {
                    const transaction = db.transaction([STORE_NAME], "readwrite");
                    const store = transaction.objectStore(STORE_NAME);
                    store.clear();
                    transaction.oncomplete = () => {
                        loadLogsFromDB();
                    };
                }
            );
        }

        // --- SISTEM SUARA SINTETIS INTERNAL (WEB AUDIO API) ---
        function initAudioContext() {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
        }

        // Sintesis Brown Noise secara manual menggunakan buffer matematika (Offline/Ringan)
        function generateBrownNoiseNode() {
            initAudioContext();
            
            // Membuat buffer 4 detik unik agar loop tidak terdengar putus-putus
            const bufferSize = 4 * audioCtx.sampleRate;
            const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            
            let lastOut = 0.0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                // Rumus pergeseran acak Brown Noise (Integrasi White Noise dengan Loss filter)
                output[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = output[i];
                output[i] *= 3.5; // Kompensasi volume yang hilang dari filter
            }
            
            const source = audioCtx.createBufferSource();
            source.buffer = noiseBuffer;
            source.loop = true;
            
            // Konfigurasi Volume yang Sehat & Tidak Mengagetkan (Default lembut: 0.06 / 6%)
            brownNoiseGain = audioCtx.createGain();
            brownNoiseGain.gain.setValueAtTime(0.06, audioCtx.currentTime);
            
            source.connect(brownNoiseGain);
            brownNoiseGain.connect(audioCtx.destination);
            
            return source;
        }

        function startBrownNoise() {
            if (isBrownNoiseMuted) return;
            try {
                initAudioContext();
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                if (brownNoiseNode) {
                    stopBrownNoise();
                }
                brownNoiseNode = generateBrownNoiseNode();
                brownNoiseNode.start(0);
            } catch (e) {
                console.warn("Audio Context diblokir/tidak didukung peramban saat ini.", e);
            }
        }

        function stopBrownNoise() {
            if (brownNoiseNode) {
                try {
                    brownNoiseNode.stop();
                } catch (e) {}
                brownNoiseNode = null;
            }
        }

        function playSuccessChime() {
            try {
                initAudioContext();
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                
                // Nada 1 (C5)
                const osc1 = audioCtx.createOscillator();
                const gain1 = audioCtx.createGain();
                osc1.type = 'sine';
                osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); 
                osc1.connect(gain1);
                gain1.connect(audioCtx.destination);
                gain1.gain.setValueAtTime(0.1, audioCtx.currentTime);
                gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                osc1.start();
                osc1.stop(audioCtx.currentTime + 0.5);

                // Nada 2 (E5) berjalan sedikit delay
                setTimeout(() => {
                    const osc2 = audioCtx.createOscillator();
                    const gain2 = audioCtx.createGain();
                    osc2.type = 'sine';
                    osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); 
                    osc2.connect(gain2);
                    gain2.connect(audioCtx.destination);
                    gain2.gain.setValueAtTime(0.1, audioCtx.currentTime);
                    gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
                    osc2.start();
                    osc2.stop(audioCtx.currentTime + 0.6);
                }, 150);
            } catch (e) {
                console.log("Gagal menyalakan chime.");
            }
        }

        function toggleNoiseSilence() {
            isBrownNoiseMuted = !isBrownNoiseMuted;
            localStorage.setItem('is_brown_noise_muted', isBrownNoiseMuted);
            updateNoiseUI();

            if (isBrownNoiseMuted) {
                stopBrownNoise();
            } else {
                if (isTimerRunning) {
                    startBrownNoise();
                }
            }
        }

        function updateNoiseUI() {
            const icon = document.getElementById('noise-icon');
            const txt = document.getElementById('noise-status-text');
            if (isBrownNoiseMuted) {
                txt.innerText = "MUTE";
                icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />`;
            } else {
                txt.innerText = "ON";
                icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />`;
            }
        }

        // --- INISIALISASI AWAL ---
        window.onload = async () => {
            renderQuickRoutines();
            updateNoiseUI();
            if (apiKey) {
                document.getElementById('api-key-input').value = apiKey;
                document.getElementById('api-key-status').classList.remove('hidden');
            }
            try {
                await initIndexedDB();
            } catch (e) {
                console.log("IndexedDB Gagal dimuat.");
            }
        };

        // --- SELEKTOR MODE ---
        function setMode(mode) {
            currentMode = mode;
            const directBtn = document.getElementById('mode-direct-btn');
            const curhatBtn = document.getElementById('mode-curhat-btn');
            const inputEl = document.getElementById('task-input');
            
            if (mode === 'direct') {
                directBtn.classList.add('bg-white', 'text-[#4A3F35]', 'shadow-sm');
                directBtn.classList.remove('text-[#4A3F35]/70');
                curhatBtn.classList.remove('bg-white', 'text-[#4A3F35]', 'shadow-sm');
                curhatBtn.classList.add('text-[#4A3F35]/70');
                inputEl.placeholder = "Tulis satu tugas spesifik yang ingin kamu mulai... (Contoh: Bersihkan meja kerja)";
            } else {
                curhatBtn.classList.add('bg-white', 'text-[#4A3F35]', 'shadow-sm');
                curhatBtn.classList.remove('text-[#4A3F35]/70');
                directBtn.classList.remove('bg-white', 'text-[#4A3F35]', 'shadow-sm');
                directBtn.classList.add('text-[#4A3F35]/70');
                inputEl.placeholder = "Tumpahkan kecemasan atau pikiran berantakanmu di sini... (Contoh: Aku stres banget besok ada ujian tapi kamar berantakan sekali dan aku pusing mau mulai dari mana)";
            }
        }

        // --- MANAJEMEN UI & TRANSISI SCREEN ---
        function showScreen(screenId) {
            document.getElementById('screen-input').classList.add('hidden');
            document.getElementById('screen-loading').classList.add('hidden');
            document.getElementById('screen-step').classList.add('hidden');
            document.getElementById('screen-finish').classList.add('hidden');
            document.getElementById('screen-settings').classList.add('hidden');
            
            document.getElementById(screenId).classList.remove('hidden');
            
            if (screenId === 'screen-settings') {
                document.getElementById('settings-toggle-btn').classList.add('opacity-0', 'pointer-events-none');
            } else {
                document.getElementById('settings-toggle-btn').classList.remove('opacity-0', 'pointer-events-none');
            }
        }

        function showError(message) {
            const errorBox = document.getElementById('error-box');
            document.getElementById('error-text').innerText = message;
            errorBox.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (document.getElementById('screen-loading').classList.contains('hidden') === false) {
                showScreen('screen-input');
            }
        }

        function hideError() {
            document.getElementById('error-box').classList.add('hidden');
        }

// --- SISTEM TIMERS (DENGAN AUDIO OTOMATIS) ---
        function toggleTimerMode() {
            isCountUp = !isCountUp;
            const btn = document.getElementById('timer-mode-btn');
            btn.innerText = isCountUp ? "Mode: Hitung Naik (↑)" : "Mode: Hitung Mundur (↓)";
            updateTimerDisplay();
        }

        function setupStepTimer(minutes) {
            clearInterval(timerInterval);
            isTimerRunning = false;
            totalTimeSec = (minutes || 5) * 60; // fallback ke 5 menit
            timeLeft = totalTimeSec; 
            timeElapsed = 0;
            updateTimerDisplay();
            setTimerPlayIcon(false);
            
            // Aktivasi otomatis instan ketika layar langkah dimuat
            setTimeout(() => {
                startActiveTimer();
            }, 300);
        }

        function updateTimerDisplay() {
            let displayTime = isCountUp ? timeElapsed : timeLeft;
            const mins = Math.floor(displayTime / 60);
            const secs = displayTime % 60;
            document.getElementById('timer-display').innerText = 
                `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            // Update UI Circular Progress
            const circle = document.getElementById('timer-circle');
            if (circle && totalTimeSec > 0) {
                const circumference = 283; 
                let progress = timeElapsed / totalTimeSec;
                if (progress > 1) progress = 1;
                // Logika stroke offset berdasarkan mode
                circle.style.strokeDashoffset = isCountUp ? circumference - (progress * circumference) : progress * circumference;
            }
        }

        function startActiveTimer() {
            if (isTimerRunning) return;
            isTimerRunning = true;
            setTimerPlayIcon(true);
            
            // Jalankan audio brown noise penenang otomatis
            startBrownNoise();

            timerInterval = setInterval(() => {
                if (timeLeft > 0) {
                    timeLeft--;
                    timeElapsed++;
                    updateTimerDisplay();
                } else {
                    clearInterval(timerInterval);
                    isTimerRunning = false;
                    setTimerPlayIcon(false);
                    stopBrownNoise();
                    playSuccessChime();
                    showCustomAlert("Waktu Selesai", "Bagus sekali! Waktu pengerjaan langkah mikro ini telah habis.");
                }
            }, 1000);
        }

        function toggleTimer() {
            if (isTimerRunning) {
                clearInterval(timerInterval);
                isTimerRunning = false;
                setTimerPlayIcon(false);
                stopBrownNoise();
            } else {
                startActiveTimer();
            }
        }

        function resetTimer() {
            clearInterval(timerInterval);
            const currentStep = steps[currentStepIndex];
            totalTimeSec = (currentStep ? currentStep.duration : 5) * 60;
            timeLeft = totalTimeSec;
            timeElapsed = 0;
            isTimerRunning = false;
            updateTimerDisplay();
            setTimerPlayIcon(false);
            stopBrownNoise();
        }

        function setTimerPlayIcon(running) {
            const icon = document.getElementById('play-icon');
            if (running) {
                icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />`;
            } else {
                icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />`;
            }
        }

        function toggleTimerVisibility() {
            isTimerVisible = !isTimerVisible;
            const container = document.getElementById('timer-container');
            const hiddenMsg = document.getElementById('timer-hidden-message');
            const btn = document.getElementById('hide-timer-btn');
            
            if (isTimerVisible) {
                container.classList.remove('hidden');
                hiddenMsg.classList.add('hidden');
                btn.innerText = "Sembunyikan";
            } else {
                container.classList.add('hidden');
                hiddenMsg.classList.remove('hidden');
                btn.innerText = "Tampilkan";
            }
        }

        // --- PROSES KOMUNIKASI GEMINI API ---
        async function startProcess() {
            hideError();
            
            

            const inputEl = document.getElementById('task-input');
            currentTask = inputEl.value.trim();
            
            if (!currentTask) {
                showError("Tuliskan tugasmu atau apa yang sedang kamu rasakan terlebih dahulu.");
                return;
            }

            showScreen('screen-loading');
            document.getElementById('loading-text').innerText = "Menyusun langkah termudah...";

            let systemPrompt = "";

if (currentMode === "direct") {
                systemPrompt = `Anda adalah asisten khusus untuk pengguna dengan ADHD Inattentive yang sedang mengalami task paralysis.

PROSES BERPIKIR WAJIB (Chain of Thought & Root Cause Analysis):
1. Saat menerima tugas, lakukan teknik "5 Whys" secara internal pada field 'root_cause_analysis'. Tanyakan: Mengapa pengguna menunda ini? Apa hambatan eksekutif/kognitif aslinya? (Misal: tugas tidak jelas, terlalu banyak langkah, takut gagal).
2. Tuliskan satu kalimat empati/validasi singkat di field 'validation_message' yang merangkum pengertian Anda atas akar masalah tersebut.
3. Berdasarkan RCA, rancang 3-5 langkah fisik murni untuk menembus akar masalah tersebut ke dalam field 'steps'.

ATURAN LANGKAH (steps):
1. Langkah pertama harus sangat sepele (contoh: "Berdiri", "Buka laptop", "Ambil satu kertas").
2. WAJIB gunakan KATA KERJA FISIK MURNI. HINDARI kata kerja abstrak (misal: "Siapkan", "Rencanakan").
3. Bahasa Indonesia yang santai dan langsung ke inti.`;
            } else {
                systemPrompt = `Anda adalah asisten empati khusus untuk pengguna dengan ADHD Inattentive yang sedang kewalahan, cemas, atau mengalami pikiran berantakan (brain dump).

PROSES BERPIKIR WAJIB (Chain of Thought & Root Cause Analysis):
1. Lakukan Root Cause Analysis & 5 Whys pada curhatan pengguna di field 'root_cause_analysis'. Bongkar benang kusut kecemasan mereka untuk menemukan SATU masalah fisik/praktis paling mendasar penyebab paralysis ini.
2. Tuliskan satu kalimat validasi yang sangat hangat dan memvalidasi kelelahan/akar masalah mereka di field 'validation_message'.
3. Buat 3-5 langkah mikro penyelesaian di field 'steps' untuk mengurai akar masalah tersebut.

ATURAN LANGKAH (steps):
1. LANGKAH 1 harus berupa "Grounding" / regulasi sistem saraf (contoh: "Letakkan ponsel, ambil segelas air", durasi: 1).
2. Langkah berikutnya harus fisik mikro sepele. WAJIB gunakan KATA KERJA FISIK MURNI. HINDARI kata kerja abstrak.
3. Bahasa Indonesia yang sangat hangat, lembut, dan tidak menuntut.`;
            }

            const userPrompt = `Input Pengguna: ${currentTask}`;

try {
                const result = await fetchGeminiWithStructuredJson(systemPrompt, userPrompt);
                steps = result.steps;
                currentStepIndex = 0;
                
                // Tampilkan insight validasi dari AI
                if(result.validation_message) {
                    document.getElementById('validation-insight-text').innerText = result.validation_message;
                }
                
                renderCurrentStep();
            } catch (error) {
                console.error(error);
                showError("Gagal berinteraksi dengan AI. Pastikan API Key Anda benar atau coba lagi nanti.");
            }
        }

        function renderCurrentStep() {
            clearInterval(timerInterval);
            isTimerRunning = false;
            stopBrownNoise();

            if (currentStepIndex >= steps.length) {
                addLogToDB(currentTask, steps.length);
                playSuccessChime();
                showScreen('screen-finish');
                return;
            }

            const current = steps[currentStepIndex];
            document.getElementById('step-progress').innerText = `LANGKAH ${currentStepIndex + 1} DARI ${steps.length}`;
            document.getElementById('step-progress-bar').style.width = `${((currentStepIndex) / steps.length) * 100}%`;
            document.getElementById('current-step-text').innerText = `${current.action} (${current.duration} mnt)`;
            
            // Kontrol Tampilan Visualisasi Pernapasan
            const breathingContainer = document.getElementById('breathing-container');
            if (currentStepIndex === 0) {
                breathingContainer.classList.remove('hidden');
                breathingContainer.classList.add('flex');
            } else {
                breathingContainer.classList.remove('flex');
                breathingContainer.classList.add('hidden');
            }
            
            showScreen('screen-step');
            setupStepTimer(current.duration);
        }

        function completeStep() {
            currentStepIndex++;
            renderCurrentStep();
        }

        async function breakdownFurther() {
            const currentHardStep = steps[currentStepIndex];
            
            showScreen('screen-loading');
            document.getElementById('loading-text').innerText = "Memecah langkah ini menjadi bagian-bagian sangat sepele...";

let systemPrompt = "";
            if (currentMode === "direct") {
                systemPrompt = `Anda adalah asisten ADHD Inattentive. Pengguna merasa langkah berikut masih terlalu berat (task paralysis kembali terjadi).
Lakukan Root Cause Analysis di 'root_cause_analysis': Kenapa langkah fisik sepele ini masih terasa berat secara kognitif?
Beri kalimat validasi bahwa tidak apa-apa untuk melambat di 'validation_message'.
Lalu pecah langkah ini di 'steps' menjadi 2 atau 3 langkah turunan fisik murni yang konyol jika tidak bisa dilakukan (contoh: "Gerakkan 5 jari tangan").`;
            } else {
                systemPrompt = `Anda adalah asisten ADHD Inattentive. Pengguna merasa langkah berikut masih terlalu berat.
Lakukan Root Cause Analysis di 'root_cause_analysis': Kenapa langkah ini memicu kecemasan atau kelebihan beban sensorik/kognitif?
Beri kalimat validasi lembut di 'validation_message'.
Pecah di 'steps' menjadi 2 atau 3 langkah turunan fisik murni yang jauh lebih lembut dan tidak menuntut.`;
            }
            
            const userPrompt = `Langkah yang terasa sulit bagi saya: "${currentHardStep.action}"`;

            try {
                const result = await fetchGeminiWithStructuredJson(systemPrompt, userPrompt);
                steps.splice(currentStepIndex, 1, ...result.steps);
                
                if(result.validation_message) {
                    document.getElementById('validation-insight-text').innerText = result.validation_message;
                }
                
                renderCurrentStep();
            } catch (error) {
                console.error(error);
                showError("Gagal memecah tugas ini. Silakan lewati atau coba lagi.");
            }
        }

        function resetApp() {
            clearInterval(timerInterval);
            isTimerRunning = false;
            stopBrownNoise();
            currentTask = "";
            steps = [];
            currentStepIndex = 0;
            document.getElementById('task-input').value = "";
            showScreen('screen-input');
        }

        async function fetchGeminiWithStructuredJson(systemPrompt, userPrompt, retries = 3) {
            // Arahkan pemanggilan ke file serverless Anda di folder /api
            const url = `/api/gemini`; 
            
            let delay = 1000;
            
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ systemPrompt, userPrompt })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error status: ${response.status}`);
                    }

                    // Data sudah dalam bentuk JSON rapi dari backend
                    return await response.json(); 

                } catch (error) {
                    if (i === retries - 1) throw error;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; 
                }
            }
        }

        // --- MANAJEMEN CRUD PINTASAN RUTINITAS ---
        function openSettings() {
            renderRoutinesList();
            loadLogsFromDB();
            showScreen('screen-settings');
        }

        function closeSettings() {
            renderQuickRoutines();
            showScreen('screen-input');
        }

        function renderQuickRoutines() {
            const container = document.getElementById('quick-routines-container');
            const list = document.getElementById('quick-routines-list');
            
            if (routines.length === 0) {
                container.classList.add('hidden');
                return;
            }
            
            container.classList.remove('hidden');
            list.innerHTML = '';
            
            routines.forEach(routine => {
                const btn = document.createElement('button');
                btn.className = "bg-white border border-[#E6DFD3] text-[#4A3F35] text-xs py-2 px-4 rounded-full hover:border-[#8E9B79] hover:bg-[#F5F0E6] transition-colors shadow-sm";
                btn.innerText = routine.text;
                btn.onclick = () => {
                    document.getElementById('task-input').value = routine.text;
                    setMode('direct');
                    startProcess();
                };
                list.appendChild(btn);
            });
        }

        function renderRoutinesList() {
            const list = document.getElementById('routines-list');
            list.innerHTML = '';
            
            if (routines.length === 0) {
                list.innerHTML = '<li class="text-center text-xs opacity-50 py-4">Belum ada rutinitas tersimpan.</li>';
                return;
            }

            routines.forEach(routine => {
                const li = document.createElement('li');
                li.className = "flex justify-between items-center p-2.5 bg-[#FDFBF7] border border-[#E6DFD3] rounded-xl text-xs";
                
                const span = document.createElement('span');
                span.className = "truncate flex-1 font-medium";
                span.innerText = routine.text;
                
                const actionDiv = document.createElement('div');
                actionDiv.className = "flex gap-2.5 ml-2";
                
                const editBtn = document.createElement('button');
                editBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-[#8E9B79]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                `;
                editBtn.className = "hover:scale-105 transition-transform bg-[#E6DFD3]/40 p-1.5 rounded-md";
                editBtn.onclick = () => editRoutine(routine.id);
                
                const delBtn = document.createElement('button');
                delBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                `;
                delBtn.className = "hover:scale-105 transition-transform bg-red-50 p-1.5 rounded-md";
                delBtn.onclick = () => deleteRoutine(routine.id);
                
                actionDiv.appendChild(editBtn);
                actionDiv.appendChild(delBtn);
                
                li.appendChild(span);
                li.appendChild(actionDiv);
                list.appendChild(li);
            });
        }

        function addRoutine(event) {
            event.preventDefault();
            const input = document.getElementById('new-routine-input');
            const text = input.value.trim();
            if (text) {
                routines.push({ id: Date.now(), text: text });
                input.value = '';
                saveRoutinesToStorage();
                renderRoutinesList();
            }
        }

        function editRoutine(id) {
            const routine = routines.find(r => r.id === id);
            if (!routine) return;
            
            const newText = prompt("Ubah tugas rutinitas:", routine.text);
            if (newText !== null && newText.trim() !== '') {
                routine.text = newText.trim();
                saveRoutinesToStorage();
                renderRoutinesList();
            }
        }

        function deleteRoutine(id) {
            showCustomConfirm(
                "Hapus Rutinitas", 
                "Apakah kamu yakin ingin menghapus rutinitas ini?", 
                () => {
                    routines = routines.filter(r => r.id !== id);
                    saveRoutinesToStorage();
                    renderRoutinesList();
                }
            );
        }

        function saveRoutinesToStorage() {
            localStorage.setItem('user_routines', JSON.stringify(routines));
        }

        // --- SISTEM INPUT SUARA (SPEECH TO TEXT) ---
        let voiceRecognition = null;
        let isVoiceListening = false;

        function toggleVoiceInput() {
            window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!window.SpeechRecognition) {
                showCustomAlert("Tidak Didukung", "Fitur input suara tidak didukung di peramban ini. Silakan gunakan Google Chrome atau Microsoft Edge.");
                return;
            }

            if (!voiceRecognition) {
                voiceRecognition = new window.SpeechRecognition();
                voiceRecognition.lang = 'id-ID';
                voiceRecognition.interimResults = false;
                voiceRecognition.maxAlternatives = 1;

                voiceRecognition.onstart = () => {
                    isVoiceListening = true;
                    document.getElementById('mic-icon').setAttribute('class', 'h-6 w-6 text-red-500 animate-pulse');
                    document.getElementById('task-input').placeholder = "Mendengarkan... Silakan ceritakan apa yang membebani pikiranmu sekarang...";
                };

                voiceRecognition.onresult = (event) => {
                    const speechResult = event.results[0][0].transcript;
                    const inputEl = document.getElementById('task-input');
                    inputEl.value = inputEl.value ? inputEl.value + " " + speechResult : speechResult;
                };

                voiceRecognition.onerror = (event) => {
                    console.error("Speech Recognition Error:", event.error);
                    stopVoiceListening();
                };

                voiceRecognition.onend = () => {
                    stopVoiceListening();
                };
            }

            if (isVoiceListening) {
                voiceRecognition.stop();
            } else {
                voiceRecognition.start();
            }
        }

        function stopVoiceListening() {
            isVoiceListening = false;
            const micIcon = document.getElementById('mic-icon');
            if (micIcon) micIcon.setAttribute('class', 'h-6 w-6 text-[#8E9B79]');
            
            const inputEl = document.getElementById('task-input');
            if (inputEl && !inputEl.value.trim()) {
                setMode(currentMode); // Mengembalikan placeholder asli sesuai mode aktif jika kosong
            }
        }

        // --- PENYIMPANAN API KEY ---
        function saveApiKey(event) {
            event.preventDefault();
            const input = document.getElementById('api-key-input');
            const newKey = input.value.trim();
            const statusEl = document.getElementById('api-key-status');
            
            if (newKey) {
                apiKey = newKey;
                localStorage.setItem('gemini_api_key', apiKey);
                statusEl.innerText = "✓ API Key berhasil disimpan.";
                statusEl.classList.remove('hidden', 'text-red-500');
                statusEl.classList.add('text-[#8E9B79]');
            } else {
                apiKey = "";
                localStorage.removeItem('gemini_api_key');
                statusEl.innerText = "⚠ API Key dihapus.";
                statusEl.classList.remove('hidden', 'text-[#8E9B79]');
                statusEl.classList.add('text-red-500');
            }
        }
    
