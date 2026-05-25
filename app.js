// Firebase Setup (Database aur Storage dono import kiye gaye hain)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, onValue, remove, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, listAll, deleteObject, getMetadata, getBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
const firebaseConfig = {
    apiKey: "AIzaSyAUqj-e7B40zIBupgC1uvrvIoriTU7flPs",
    authDomain: "payment-reminder-3df14.firebaseapp.com",
    projectId: "payment-reminder-3df14",
    storageBucket: "payment-reminder-3df14.firebasestorage.app",
    messagingSenderId: "1016664337217",
    appId: "1:1016664337217:web:f53523acd7746dabf6cfc0",
    databaseURL: "https://payment-reminder-3df14-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const storage = getStorage(app);
const auth = getAuth(app);


let partyMaster = {};
let brokerMaster = {};
let billData = [];
let billLinks = {};



// 🌟 NAYA CODE: Firebase में मोबाइल नंबर सेव/रीड करने के लिए एक फिक्स चाबी
window.getFirebaseSafeKey = function (name) {
    if (!name) return "Unknown";
    // यह Firebase के दुश्मन निशानों को '_' में बदल देगा
    return name.toString().replace(/[.#$\[\]]/g, '_');
};




// 🛡️ XSS सिक्यूरिटी फ़िल्टर: खतरनाक कोड को साधारण टेक्स्ट में बदलने के लिए
window.escapeHtml = function (str) {
    if (!str) return "";
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};

window.showPage = function (p) {
    document.getElementById("reminderPage").style.display = p === "reminder" ? "block" : "none";
    document.getElementById("masterPage").style.display = p === "master" ? "block" : "none";
    document.getElementById("storagePage").style.display = p === "storage" ? "block" : "none";

    document.getElementById("nav-reminder").classList.toggle("active", p === "reminder");
    document.getElementById("nav-master").classList.toggle("active", p === "master");
    document.getElementById("nav-storage").classList.toggle("active", p === "storage");

    if (p === 'master') renderMasters();
    if (p === 'storage') loadStorageFiles();
};

// --- PDF SPLIT AND CLOUD UPLOAD LOGIC ---
document.getElementById('pdfInput').addEventListener('change', async (e) => {
    let file = e.target.files[0];
    if (!file) return;

    document.getElementById('pdfStatus').innerText = "⏳ Uploading & Splitting... Please wait.";

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = window['pdfjs-dist/build/pdf'];
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

        const pdfDocText = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const { PDFDocument } = window.PDFLib;
        const pdfDocEdit = await PDFDocument.load(arrayBuffer);

        let uploadedCount = 0;
        let newLinks = {};
        let uploadPromises = [];

        let scanMsg = "⏳ स्कैनिंग शुरू हो रही है...";
        let uploadMsg = "🚀 अपलोडिंग स्टैंडबाय पर है...";

        const showLiveProgress = () => {
            document.getElementById('pdfStatus').innerHTML = `
        <div style="color: #ff9800; font-size: 13px; margin-bottom: 4px;">${scanMsg}</div>
        <div style="color: #128C7E; font-size: 15px;">${uploadMsg}</div>
      `;
        };
        showLiveProgress();

        let billGroups = {};

        for (let i = 0; i < pdfDocText.numPages; i++) {
            scanMsg = `⚡ स्कैनिंग चालू है: पेज ${i + 1} / ${pdfDocText.numPages} पढ़ा जा रहा है...`;
            showLiveProgress();

            const page = await pdfDocText.getPage(i + 1);
            const textContent = await page.getTextContent();
            const fullText = textContent.items.map(item => item.str).join(" ");

            let invoiceMatch = fullText.match(/SL\/\d+/i);
            let dateMatch = fullText.match(/\d{2}\/\d{2}\/\d{4}/);

            if (invoiceMatch) {
                let safeInvoiceNo = invoiceMatch[0].replace(/\//g, "_");
                let safeDate = dateMatch ? "_" + dateMatch[0].replace(/\//g, "-") : "";
                let groupKey = `${safeInvoiceNo}${safeDate}`;

                if (!billGroups[groupKey]) billGroups[groupKey] = [];
                billGroups[groupKey].push(i);
            }
        }

        scanMsg = `✅ स्कैनिंग पूरी! अब ${Object.keys(billGroups).length} बिल्स क्लाउड पर जा रहे हैं...`;
        showLiveProgress();

        for (let groupKey in billGroups) {
            let pageIndices = billGroups[groupKey];
            let secretCode = (Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)).substring(0, 15);
            let fileKey = `${groupKey}_${secretCode}`;

            const newPdf = await PDFDocument.create();
            const copiedPages = await newPdf.copyPages(pdfDocEdit, pageIndices);
            copiedPages.forEach(page => newPdf.addPage(page));
            const pdfBytes = await newPdf.save();

            let uploadTask = (async () => {
                const fileRef = storageRef(storage, `bills/Bill_${fileKey}.pdf`);
                await uploadBytes(fileRef, pdfBytes);
                const downloadURL = await getDownloadURL(fileRef);
                newLinks[fileKey] = downloadURL;
                uploadedCount++;

                uploadMsg = `🚀 फ़ास्ट अपलोडिंग: ${uploadedCount} / ${Object.keys(billGroups).length} बिल्स सेव हो गए...`;
                showLiveProgress();
            })();
            uploadPromises.push(uploadTask);
        }

        document.getElementById('pdfStatus').innerText = `⏳ स्कैनिंग पूरी हुई! अब बिल्स एक साथ (Parallel) अपलोड हो रहे हैं...`;

        await Promise.all(uploadPromises);

        if (Object.keys(newLinks).length > 0) {
            await update(ref(db, "billLinks"), newLinks);
        }

        document.getElementById('pdfStatus').innerText = `✅ Success! ${uploadedCount} Bills Uploaded.`;

        if (document.getElementById("storagePage").style.display === "block") {
            window.loadStorageFiles();
        }

        setTimeout(() => {
            alert(`शानदार! ${uploadedCount} बिल्स कट कर Cloud पर बहुत ही तेज़ स्पीड में सेव हो गए हैं।`);
        }, 1000);

    } catch (err) {
        console.error("PDF Processing Error: ", err);
        alert("PDF प्रोसेस करने में कोई दिक्कत आई। Console चेक करें।");
        document.getElementById('pdfStatus').innerText = "❌ Error processing PDF";
    }
    e.target.value = "";
});

window.askMobileNumber = function (titleText, defaultVal = "") {
    return new Promise((resolve) => {
        let modal = document.getElementById('customPrompt');
        let title = document.getElementById('promptTitle');
        let input = document.getElementById('promptInput');
        let contactBtn = document.getElementById('promptContactBtn');

        title.innerText = titleText;
        input.value = defaultVal;
        modal.style.display = 'flex';
        input.focus();

        let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            contactBtn.style.display = 'block';
            contactBtn.onclick = async () => {
                if (!('contacts' in navigator)) { alert("आपके ब्राउज़र में कांटेक्ट पढ़ने का फीचर ब्लॉक है!"); return; }
                try {
                    const contacts = await navigator.contacts.select(['tel'], { multiple: false });
                    if (contacts.length > 0 && contacts[0].tel && contacts[0].tel.length > 0) {
                        let cleanNum = contacts[0].tel[0].replace(/\D/g, '');
                        if (cleanNum.length > 10) cleanNum = cleanNum.slice(-10);
                        input.value = cleanNum;
                    } else { alert("इस कांटेक्ट में कोई मोबाइल नंबर सेव नहीं है।"); }
                } catch (ex) { console.log("Contact API Error:", ex); }
            };
        } else { contactBtn.style.display = 'none'; }

        document.getElementById('promptSave').onclick = () => { modal.style.display = 'none'; resolve(input.value); };
        document.getElementById('promptCancel').onclick = () => { modal.style.display = 'none'; resolve(null); };
    });
}
// 🌟 NAYA CODE: पुराने कैमरों (Listeners) को बंद करने के लिए एक लिस्ट
let unsubscribers = [];

function loadData() {
    // 1. अगर पहले से कोई कैमरे चालू हैं, तो उन्हें बंद (Unsubscribe) करो
    unsubscribers.forEach(fn => fn());
    unsubscribers = []; // लिस्ट को वापस खाली कर दो

    // 2. नए सिरे से कैमरे चालू करो और उन्हें बंद करने का रिमोट लिस्ट में डाल लो
    unsubscribers.push(
        onValue(ref(db, "partyMaster"), snap => { partyMaster = snap.val() || {}; renderMasters(); })
    );

    unsubscribers.push(
        onValue(ref(db, "brokerMaster"), snap => { brokerMaster = snap.val() || {}; renderMasters(); })
    );

    unsubscribers.push(
        onValue(ref(db, "billData"), snap => {
            let data = snap.val();
            billData = data ? (Array.isArray(data) ? data : Object.values(data)) : [];
            renderTable();
        })
    );

    unsubscribers.push(
        onValue(ref(db, "billLinks"), snap => {
            billLinks = snap.val() || {};
            if (document.getElementById("storagePage").style.display === "block") {
                window.loadStorageFiles();
            }
        })
    );
}

function renderMasters() {
    let pbody = document.querySelector("#partyTable tbody");
    if (!pbody) return;
    pbody.innerHTML = "";
    for (let p in partyMaster) {
        let tr = document.createElement("tr");
        // 🌟 NAYA CODE: Party Master को XSS से सुरक्षित किया
        tr.innerHTML = `<td data-label="Party">${escapeHtml(p)}</td><td data-label="Mobile">${escapeHtml(partyMaster[p])}</td>`; let edit = document.createElement("button"); edit.textContent = "Edit";
        edit.onclick = async function () {
            let newMobile = await askMobileNumber(`Edit Mobile: ${p}`, partyMaster[p]);
            if (!newMobile) return;
            await set(ref(db, "partyMaster/" + p), newMobile.replace(/\D/g, '').slice(-10));
        }
        let del = document.createElement("button"); del.textContent = "Delete"; del.className = "btn-danger";
        del.onclick = async function () { if (confirm("Are you sure you want to delete " + p + "?")) await remove(ref(db, "partyMaster/" + p)); }
        let tdActions = document.createElement("td"); tdActions.className = "actions";
        tdActions.appendChild(edit); tdActions.appendChild(del);
        tr.appendChild(tdActions); pbody.appendChild(tr);
    }

    let bbody = document.querySelector("#brokerTable tbody");
    if (!bbody) return;
    bbody.innerHTML = "";
    for (let b in brokerMaster) {
        let tr = document.createElement("tr");
        // 🌟 NAYA CODE: Broker Master को XSS से सुरक्षित किया
        tr.innerHTML = `<td data-label="Broker">${escapeHtml(b)}</td><td data-label="Mobile">${escapeHtml(brokerMaster[b])}</td>`; let edit = document.createElement("button"); edit.textContent = "Edit";
        edit.onclick = async function () {
            let newMobile = await askMobileNumber(`Edit Mobile: ${b}`, brokerMaster[b]);
            if (!newMobile) return;
            await set(ref(db, "brokerMaster/" + b), newMobile.replace(/\D/g, '').slice(-10));
        }
        let del = document.createElement("button"); del.textContent = "Delete"; del.className = "btn-danger";
        del.onclick = async function () { if (confirm("Are you sure you want to delete " + b + "?")) await remove(ref(db, "brokerMaster/" + b)); }
        let tdActions = document.createElement("td"); tdActions.className = "actions";
        tdActions.appendChild(edit); tdActions.appendChild(del);
        tr.appendChild(tdActions); bbody.appendChild(tr);
    }
}

function parseDate(str) {
    if (!str) return null;
    let p = str.split("/");
    if (p.length === 3) {
        let d = parseInt(p[0]); let m = parseInt(p[1]) - 1; let y = parseInt(p[2]);
        if (y < 100) { y = (y < 50) ? 2000 + y : 1900 + y; }
        return new Date(y, m, d);
    }
    return new Date(str);
}

function calcDays(dateStr) {
    let d = parseDate(dateStr);
    if (!d || isNaN(d)) return "";
    let today = new Date();
    return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}

function parseCSVRow(text, delimiter) {
    // ✅ Seedha likho — clean aur safe
    let regex = new RegExp(`("[^"]*"|[^${delimiter}\\n]*)(${delimiter}|\\n|$)`, 'g');
    let matches = []; let match;
    while (match = regex.exec(text)) {
        if (match[1] !== undefined) { let val = match[1].replace(/(^"|"$)/g, '').trim(); matches.push(val); }
        if (match[2] === '\n' || match[2] === '') break;
    }
    return matches;
}

window.updateDynamicTotal = function (safeKey, totalBillsCount) {
    let checkboxes = document.querySelectorAll(`.chk-${safeKey}:checked`);
    let total = 0;
    checkboxes.forEach(chk => {
        let amt = parseFloat(chk.getAttribute('data-amt'));
        if (!isNaN(amt)) total += amt;
    });
    let totalTd = document.getElementById(`total-${safeKey}`);
    if (totalTd) totalTd.innerText = `₹${total.toFixed(2)}`;
    let countTd = document.getElementById(`count-${safeKey}`);
    if (countTd) countTd.innerText = `${checkboxes.length} / ${totalBillsCount} Bill(s)`;
}

function renderTable() {
    let tbody = document.querySelector("#dataTable tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!billData || billData.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No data available. Please upload a CSV.</td></tr>";
        return;
    }

    let groupedData = {};
    billData.forEach(item => {
        let pName = item.party.trim();
        if (!groupedData[pName]) { groupedData[pName] = { party: pName, broker: item.broker || "", bills: [] }; }
        groupedData[pName].bills.push({ bill: item.bill, date: item.date, amount: item.amount, days: calcDays(item.date) });
    });

    for (let key in groupedData) {





        let item = groupedData[key];
        // 🌟 NAYA CODE: Data Collision से बचने के लिए नाम को एन्क्रिप्ट करना
        let safeKey = btoa(unescape(encodeURIComponent(key))).replace(/[^a-zA-Z0-9]/g, '');





        let tr = document.createElement("tr");
        tr.className = "main-row";
        tr.setAttribute("data-party", item.party);
        tr.setAttribute("data-key", safeKey);

        let toggleBtn = document.createElement("button");
        toggleBtn.textContent = "▼ Show Bills";
        toggleBtn.className = "btn-toggle";
        toggleBtn.onclick = function () {
            let subRow = document.getElementById("subrow-" + safeKey);
            if (subRow.style.display === "none" || subRow.style.display === "") {
                subRow.style.display = "block"; toggleBtn.textContent = "▲ Hide Bills";
            } else {
                subRow.style.display = "none"; toggleBtn.textContent = "▼ Show Bills";
            }
        };

        let pbtn = document.createElement("button");
        pbtn.textContent = "Party 💬";
        pbtn.className = "btn-send-party";
        pbtn.onclick = async function () { sendSelectedBills(item.party, item.broker, 'party', safeKey, item.bills); }

        let bbtn = document.createElement("button");
        bbtn.textContent = "Broker 💬";
        bbtn.className = "btn-send-broker";
        bbtn.onclick = async function () { sendSelectedBills(item.party, item.broker, 'broker', safeKey, item.bills); }

        // 🌟 NAYA CODE: escapeHtml() का इस्तेमाल करके डेटा को सुरक्षित (Clean) किया गया है
        tr.innerHTML = `
            <td data-label="Party"><strong>${escapeHtml(item.party)}</strong></td>
            <td data-label="Selected Bills" id="count-${safeKey}">0 / ${item.bills.length} Bill(s)</td>
            <td data-label="Total Amount" style="color:#d9534f; font-weight:bold;" id="total-${safeKey}">₹0.00</td>
            <td data-label="Broker">${escapeHtml(item.broker || '-')}</td>
        `;
        let tdActions = document.createElement("td"); tdActions.className = "actions";
        tdActions.appendChild(toggleBtn); tdActions.appendChild(pbtn); tdActions.appendChild(bbtn);
        tr.appendChild(tdActions); tbody.appendChild(tr);

        let trSub = document.createElement("tr"); trSub.id = "trsub-" + safeKey;
        let tdSub = document.createElement("td"); tdSub.colSpan = 5; tdSub.className = "sub-row-cell";
        let subContainer = document.createElement("div"); subContainer.id = "subrow-" + safeKey; subContainer.className = "bill-list-container";

        let checkHTML = "";
        // 🌟 NAYA CODE: बिल नंबर और अमाउंट को भी सुरक्षित कर दिया गया है
        item.bills.forEach((b, idx) => {
            let cleanAmt = b.amount.toString().replace(/,/g, '');
            checkHTML += `
                <label class="bill-list-item">
                    <input type="checkbox" class="chk-${safeKey}" data-idx="${idx}" data-amt="${cleanAmt}" onchange="updateDynamicTotal('${safeKey}', ${item.bills.length})">
                    <span><strong>Bill:</strong> ${escapeHtml(b.bill)} | <strong>Date:</strong> ${escapeHtml(b.date)} | <strong>Amt:</strong> ₹${escapeHtml(b.amount)} (${b.days} Days)</span>
                </label>
            `;
        });
        subContainer.innerHTML = checkHTML; tdSub.appendChild(subContainer); trSub.appendChild(tdSub); tbody.appendChild(trSub);
    }
}
window.sendSelectedBills = async function (partyName, brokerName, type, safeKey, allBills) {
    let checkboxes = document.querySelectorAll(`.chk-${safeKey}:checked`);
    if (checkboxes.length === 0) { alert("कृपया भेजने के लिए कम से कम एक बिल सेलेक्ट करें!"); return; }

    let selectedBills = [];
    let selectedTotal = 0;

    checkboxes.forEach(chk => {
        let idx = parseInt(chk.getAttribute('data-idx'));
        let b = allBills[idx];
        selectedBills.push(b);
        let amt = parseFloat(b.amount.toString().replace(/,/g, ''));
        if (!isNaN(amt)) selectedTotal += amt;
    });

    // 🌟 NAYA CODE: पुरानी चाबी को हटाकर मास्टर चाबी (getFirebaseSafeKey) का इस्तेमाल 🌟
    let safePartyKey = getFirebaseSafeKey(partyName);
    let safeBrokerKey = brokerName ? getFirebaseSafeKey(brokerName) : "";
    let mobile = "";

    try {
        if (type === 'party') {
            mobile = partyMaster[safePartyKey] || "";
            if (!mobile) {
                mobile = await askMobileNumber(`Enter Number for: ${partyName}`);
                if (!mobile) return;
                mobile = mobile.replace(/\D/g, '');
                if (mobile.length < 10) { alert("कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें।"); return; }
                if (mobile.length > 10) mobile = mobile.slice(-10);

                // डेटाबेस में मास्टर चाबी से पार्टी का नंबर सेव करना
                await set(ref(db, "partyMaster/" + safePartyKey), mobile);
            }
            sendToWhatsApp(mobile, type, partyName, partyName, selectedBills, selectedTotal);
        } else {
            if (!brokerName) { alert("Broker not found for this entry"); return; }
            mobile = brokerMaster[safeBrokerKey];
            if (!mobile) {
                mobile = await askMobileNumber(`Enter Number for Broker: ${brokerName}`);
                if (!mobile) return;
                mobile = mobile.replace(/\D/g, '');
                if (mobile.length < 10) { alert("कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें।"); return; }
                if (mobile.length > 10) mobile = mobile.slice(-10);

                // डेटाबेस में मास्टर चाबी से ब्रोकर का नंबर सेव करना
                await set(ref(db, "brokerMaster/" + safeBrokerKey), mobile);
            }
            sendToWhatsApp(mobile, type, brokerName, partyName, selectedBills, selectedTotal);
        }
    } catch (error) { alert("नंबर सेव करने में दिक्कत आई: " + error.message); console.error(error); }
}
document.getElementById("fileInput").addEventListener("change", async function (e) {
    let file = e.target.files[0];
    if (!file) return;
    let reader = new FileReader();

    reader.onload = async function (ev) {
        document.querySelector("#dataTable tbody").innerHTML = "<tr><td colspan='5' style='text-align:center;'>Uploading Data to Cloud... Please wait.</td></tr>";




        let text = ev.target.result;
        let delimiter = text.includes(";") ? ";" : ",";
        // 🌟 NAYA CODE: Windows और Mac दोनों तरह की CSV फाइलों को सपोर्ट करने के लिए
        let rawRows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

        let rows = rawRows.map(r => parseCSVRow(r.trim(), delimiter));
        if (rows.length < 1) return;

        let headerIndex = -1;
        let header = [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i] && rows[i].length > 3) {
                let tempHeader = rows[i].map(h => h ? h.toLowerCase().trim() : "");
                if (tempHeader.some(h => h.includes("account") || h.includes("party"))) { headerIndex = i; header = tempHeader; break; }
            }
        }

        if (headerIndex === -1) {
            alert("Error: File mein 'Account Name' ya 'Party' jaisa koi column nahi mila.");
            document.querySelector("#dataTable tbody").innerHTML = "<tr><td colspan='5' style='text-align:center;'>Upload Failed. Format Incorrect.</td></tr>";
            return;
        }

        let dateIndex = header.findIndex(h => h.includes("date"));
        let billIndex = header.findIndex(h => h.includes("os.id") || h.includes("bill"));
        let nameIndex = header.findIndex(h => h.includes("account") || h.includes("party"));
        let amountIndex = header.findIndex(h => h.includes("amount"));
        let brokerIndex = header.findIndex(h => h.includes("broker") || h.includes("boker") || h.includes("dalal") || h.includes("agent"));

        let newBillData = [];
        for (let i = headerIndex + 1; i < rows.length; i++) {
            let r = rows[i];
            if (!r || r.length < 4 || !r[nameIndex] || r[nameIndex].includes("---")) continue;
            newBillData.push({
                party: r[nameIndex].trim(),
                bill: r[billIndex] ? r[billIndex].trim() : "",
                date: r[dateIndex] ? r[dateIndex].trim() : "",
                // 🌟 NAYA CODE: अमाउंट में से कॉमा (,) और रुपये (₹) का निशान हटाकर शुद्ध नंबर बनाना
                amount: r[amountIndex] ? r[amountIndex].replace(/[₹,\s]/g, '').trim() : "0",
                broker: r[brokerIndex] ? r[brokerIndex].trim() : ""
            });
        }
        await set(ref(db, "billData"), newBillData);
        alert("Data successfully uploaded to Cloud!");
        document.getElementById("fileInput").value = "";
    }
    reader.readAsText(file);
});

window.sendToWhatsApp = function (mobile, type, receiverName, partyName, bills, totalAmount) {
    let msg = "";
    let formattedTotal = totalAmount.toFixed(2);

    let billsText = bills.map((b, index) => {
        let finalLink = null;
        let csvNumMatch = b.bill.match(/\d+$/);
        let csvNum = csvNumMatch ? parseInt(csvNumMatch[0], 10) : null;

        if (csvNum !== null) {
            for (let key in billLinks) {
                let keyNumMatch = key.match(/SL_(\d+)/);
                if (keyNumMatch) {
                    let keyNum = parseInt(keyNumMatch[1], 10);
                    if (keyNum === csvNum) {
                        finalLink = billLinks[key];
                        break;
                    }
                }
            }
        }

        let billLinkStr = finalLink ? `\n🔗 *बिल की कॉपी:* ${finalLink}` : "";
        return `${index + 1}. बिल नं: ${b.bill} | दिनांक: ${b.date} | राशि: ₹${parseFloat(b.amount.toString().replace(/,/g, '')).toFixed(2)} (${b.days} दिन)${billLinkStr}`;
    }).join('\n\n');

    if (type === 'broker') {
        msg = `नमस्ते ${receiverName},\n\nहमारी फर्म RAVI KUMAR DEEPAK KUMAR की तरफ से यह पार्टी के पेमेंट का रिमाइंडर है। कृपया इस पार्टी से पेमेंट करवाने का निवेदन करें:\n\nपार्टी का नाम: ${partyName}\n\n*लंबित बिलों का विवरण:*\n${billsText}\n\n*कुल बकाया राशि: ₹${formattedTotal}*\n\n------------------\nBank: SBI\nA/c No: 32837750647\nIFSC: SBIN0031978\nUPI: 9887938518@YBL\n------------------\n\nधन्यवाद,\nRAVI KUMAR DEEPAK KUMAR`;
    } else {
        msg = `नमस्ते ${receiverName},\n\nहमारी फर्म RAVI KUMAR DEEPAK KUMAR की तरफ से यह पेमेंट रिमाइंडर है। \nआपके निम्नलिखित बिल भुगतान के लिए लंबित हैं:\n\n*लंबित बिलों का विवरण:*\n${billsText}\n\n*कुल बकाया राशि: ₹${formattedTotal}*\n\nकृपया नीचे दी गई डिटेल्स पर तुरंत भुगतान करें:\n\n------------------\nBank: SBI\nA/c No: 32837750647\nIFSC: SBIN0031978\nUPI: 9887938518@YBL\n------------------\n\nधन्यवाद,\nRAVI KUMAR DEEPAK KUMAR`;
    }
    window.open("https://wa.me/91" + mobile + "?text=" + encodeURIComponent(msg));
}

window.filterTable = function () {
    let input = document.getElementById("searchBox").value.toLowerCase();
    let mainRows = document.querySelectorAll("#dataTable tbody tr.main-row");
    let firstMatch = null;

    mainRows.forEach(tr => {
        let party = tr.getAttribute("data-party").toLowerCase();
        let safeKey = tr.getAttribute("data-key");
        let subRow = document.getElementById("trsub-" + safeKey);

        if (party.includes(input)) {
            tr.style.display = "";



            // 🌟 NAYA CODE: Search करने पर बिल्स वाले डब्बे का सही बैलेंस बनाना
            if (subRow) {
                let innerDiv = subRow.querySelector('.bill-list-container');
                // चेक करो कि क्या अंदर का डब्बा (बिल्स) पहले से खुला है?
                if (innerDiv && innerDiv.style.display === "block") {
                    subRow.style.display = ""; // खुला है तो रो को भी दिखाओ
                } else {
                    subRow.style.display = "none"; // बंद है तो रो को भी छिपा दो (खाली जगह नहीं बनेगी)
                }
            }


            if (input !== "" && !firstMatch) firstMatch = tr;
        } else {
            tr.style.display = "none";
            if (subRow) subRow.style.display = "none";
        }
    });
    if (firstMatch) firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
}

window.clearFirebaseData = async function () {
    if (confirm("Are you sure you want to clear all Bill Data and Links from Cloud?")) {
        await remove(ref(db, "billData"));
        await remove(ref(db, "billLinks"));
        alert("Data and Links Cleared!");
    }
}

// --- CLOUD SE LINKS WAPAS GENERATE KARNE KA LOGIC (SUPER FAST) ---
window.regenerateLinks = async function () {
    if (!confirm("क्या आप Cloud Storage से सभी पुराने बिल्स के लिंक्स वापस डेटाबेस में लाना चाहते हैं?")) return;

    let statusDiv = document.getElementById("pdfStatus");
    if (statusDiv) {
        statusDiv.innerText = "⏳ Cloud से 2300+ लिंक्स एक साथ Sync हो रहे हैं... कृपया 5-10 सेकंड प्रतीक्षा करें!";
        statusDiv.style.color = "#ff9800";
    }

    try {
        const listRef = storageRef(storage, 'bills');
        const res = await listAll(listRef);

        let newLinks = {};




        // 🌟 NAYA CODE: सर्वर को क्रैश होने से बचाने के लिए 50-50 के Batches में काम करना
        const BATCH_SIZE = 50;

        for (let i = 0; i < res.items.length; i += BATCH_SIZE) {
            // 50 फाइलों का एक टुकड़ा (Batch) बनाना
            const batch = res.items.slice(i, i + BATCH_SIZE);

            // सिर्फ उन 50 फाइलों के लिंक्स एक साथ मंगाना
            await Promise.all(batch.map(async (itemRef) => {
                let fileName = itemRef.name;
                let downloadURL = await getDownloadURL(itemRef);
                let fileKey = fileName.replace("Bill_", "").replace(".pdf", "");
                newLinks[fileKey] = downloadURL;
            }));
        }



        // 2300 लिंक्स को एक ही झटके में Database में सेव करना
        await set(ref(db, "billLinks"), newLinks);

        alert(`✅ शानदार! Cloud Storage से ${Object.keys(newLinks).length} बिल्स के लिंक्स सुपर-फास्ट स्पीड में वापस आ गए हैं!`);

        if (statusDiv) {
            statusDiv.innerText = "✅ Links Successfully Synced!";
            statusDiv.style.color = "green";
        }



    } catch (error) {
        console.error("Link Regeneration Error: ", error);
        alert("लिंक्स ढूँढने में कोई दिक्कत आई। Console चेक करें।");
        if (statusDiv) {
            statusDiv.innerText = "❌ Sync Failed!";
            statusDiv.style.color = "red";
        }
    }
}
let allStorageFiles = [];
let currentSortColumn = 'date';
let currentSortDirection = 'desc';

window.handleSort = function (column) {
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = column === 'date' ? 'desc' : 'asc';
    }

    document.getElementById("sortNameIcon").innerText = currentSortColumn === 'name' ? (currentSortDirection === 'asc' ? '⬆️' : '⬇️') : '↕️';
    document.getElementById("sortDateIcon").innerText = currentSortColumn === 'date' ? (currentSortDirection === 'asc' ? '⬆️' : '⬇️') : '↕️';

    filterAndSortStorage();
}

window.toggleDeleteVisibility = function () {
    let selectedCount = document.querySelectorAll('.storage-chk:checked').length;
    document.getElementById('bulkDeleteBtn').style.display = selectedCount > 0 ? 'inline-block' : 'none';
    document.getElementById('bulkShareBtn').style.display = selectedCount > 0 ? 'inline-block' : 'none';
}

// --- 1. STORAGE FILES LOAD (SUPER FAST) ---
window.loadStorageFiles = async function () {
    let tbody = document.getElementById("storageTableBody");
    document.getElementById("totalBillsCount").innerText = "Total: ⏳";
    document.getElementById('btnSelectDuplicates').style.display = 'none';
    document.getElementById('bulkDeleteBtn').style.display = 'none';

    try {
        let tempFiles = [];

        // 🌟 BADA BADLAAV: Storage की जगह सीधे 'billLinks' (Database) से नाम उठाना (0.1 सेकंड में) 🌟
        for (let fileKey in billLinks) {
            let fileName = `Bill_${fileKey}.pdf`; // असली फाइल का नाम वापस बनाना

            let dateMatch = fileName.match(/_(\d{2})-(\d{2})-(\d{4})_/);
            let formattedTime = "Unknown";
            let timestamp = 0;

            if (dateMatch) {
                formattedTime = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
                timestamp = parseInt(`${dateMatch[3]}${dateMatch[2]}${dateMatch[1]}`);
            }

            tempFiles.push({ name: fileName, uploadTime: formattedTime, timestamp: timestamp });
        }

        allStorageFiles = tempFiles;
        document.getElementById("totalBillsCount").innerText = `Total: ${allStorageFiles.length}`;

        if (allStorageFiles.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Cloud में कोई बिल सेव नहीं है।</td></tr>";
            return;
        }

        // सॉर्टिंग और डिज़ाइन वाला फंक्शन कॉल करना
        filterAndSortStorage();

    } catch (error) {
        console.error("Error loading files: ", error);
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:red;'>❌ Error Loading Files</td></tr>";
    }
}

window.filterAndSortStorage = function () {
    let searchTerm = document.getElementById("storageSearchBox").value.toLowerCase();
    let tbody = document.getElementById("storageTableBody");

    let filtered = allStorageFiles.filter(fileObj => fileObj.name.toLowerCase().includes(searchTerm));
    filtered.sort((a, b) => {
        let numA = parseInt(a.name.match(/SL_(\d+)/i)?.[1] || 0);
        let numB = parseInt(b.name.match(/SL_(\d+)/i)?.[1] || 0);

        if (a.timestamp !== b.timestamp) {
            return currentSortDirection === 'asc' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
        }
        return currentSortDirection === 'asc' ? numA - numB : numB - numA;
    });

    let baseCounts = {};
    let hasDuplicates = false;

    allStorageFiles.forEach(fileObj => {
        let baseName = fileObj.name.match(/SL_\d+(_\d{2}-\d{2}-\d{4})?/i)?.[0] || fileObj.name;
        baseCounts[baseName] = (baseCounts[baseName] || 0) + 1;
        if (baseCounts[baseName] > 1) hasDuplicates = true;
    });

    document.getElementById("btnSelectDuplicates").style.display = hasDuplicates ? "inline-block" : "none";

    tbody.innerHTML = "";
    if (filtered.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>सर्च के हिसाब से कोई बिल नहीं मिला।</td></tr>";
        toggleDeleteVisibility();
        return;
    }
    filtered.forEach(fileObj => {
        let fileName = fileObj.name;
        let uploadTime = fileObj.uploadTime;
        let baseName = fileName.match(/SL_\d+(_\d{2}-\d{2}-\d{4})?/i)?.[0] || fileName;
        let isDuplicate = baseCounts[baseName] > 1;

        // 🌟 NAYA CODE: फाइल के गंदे नाम में से साफ़ 'बिल नंबर' और 'तारीख' निकालना 🌟
        let displayBillNo = "Bill";
        let displayDate = "";

        // SL नंबर निकालना (जैसे: 429)
        let billMatch = fileName.match(/SL_(\d+)/i);
        if (billMatch) displayBillNo = `SL/${billMatch[1]}`;

        // तारीख निकालना (जैसे: 22-05-2026)
        let dateMatch = fileName.match(/_(\d{2}-\d{2}-\d{4})_/);
        if (dateMatch) displayDate = ` (📅 ${dateMatch[1]})`;

        // स्क्रीन पर दिखाने के लिए सुंदर नाम तैयार करना
        let cleanDisplayName = `🧾 ${displayBillNo} ${displayDate}`;

        let rowBg = isDuplicate ? "#ffebee" : "#fff";
        let dupBadge = isDuplicate ? `<span style="background: #d9534f; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 10px;">⚠️ Duplicate</span>` : "";

        let tr = document.createElement("tr");
        tr.style.background = rowBg;

        // 🌟 HTML अपडेट: अब fileName की जगह cleanDisplayName दिखेगा 🌟
        tr.innerHTML = `
      <td data-label="Select" style="text-align: center;">
        <input type="checkbox" class="storage-chk" value="${fileName}" onchange="toggleDeleteVisibility()" style="width:18px; height:18px; cursor:pointer;">
      </td>
      <td data-label="Bill Details" style="word-break: break-word;">
        <strong style="color: #0b79d0; font-size: 15px;">${cleanDisplayName}</strong> ${dupBadge}
      </td>
      <td data-label="Upload Time" style="color: #555; font-size: 14px; white-space: nowrap;">☁️ ${uploadTime}</td>
      <td data-label="View & Share" style="white-space: nowrap; text-align: center;">
        <button onclick="viewCloudFile('${fileName}')" style="background:#f0f0f0; color:#0b79d0; border:1px solid #ccc; padding: 6px 10px; border-radius: 4px; cursor:pointer;" title="View Bill">👁️ View</button>
        <button onclick="shareCloudFile('${fileName}')" style="background:#25D366; color:white; border:none; padding: 6px 10px; border-radius: 4px; cursor:pointer; margin-left: 5px;" title="Send to WhatsApp">💬 Share</button>
      </td>
      <td data-label="Action" class="actions" style="white-space: nowrap; text-align: center;">
        <button class="btn-danger" style="padding: 6px 12px; border-radius: 4px;" onclick="deleteCloudFile('${fileName}')">🗑️ Delete</button>
      </td>
    `;
        tbody.appendChild(tr);
    });


    document.getElementById("selectAllStorage").checked = false;
    toggleDeleteVisibility();
}

window.selectOldDuplicates = function () {
    let baseSeen = {};
    let checkboxes = document.querySelectorAll(".storage-chk");
    let count = 0;

    checkboxes.forEach(chk => {
        let fileName = chk.value;
        let baseName = fileName.match(/SL_\d+(_\d{2}-\d{2}-\d{4})?/i)?.[0] || fileName;
        if (!baseSeen[baseName]) {
            baseSeen[baseName] = true;
            chk.checked = false;
        } else {
            chk.checked = true;
            count++;
        }
    });

    toggleDeleteVisibility();

    if (count > 0) {
        alert(`✅ ${count} डुप्लीकेट फाइलें सेलेक्ट हो गई हैं! अब आप "Delete Selected" दबाकर इन्हें उड़ा सकते हैं।`);
    }
}

window.toggleAllStorage = function () {
    let selectAllChk = document.getElementById("selectAllStorage");
    let checkboxes = document.querySelectorAll(".storage-chk");
    checkboxes.forEach(chk => chk.checked = selectAllChk.checked);
    toggleDeleteVisibility();
}

window.deleteSelectedCloudFiles = async function () {
    let checkboxes = document.querySelectorAll(".storage-chk:checked");
    if (checkboxes.length === 0) {
        alert("कृपया डिलीट करने के लिए कम से कम एक फाइल सेलेक्ट करें!");
        return;
    }

    if (!confirm(`क्या आप सच में इन ${checkboxes.length} फाइलों को हमेशा के लिए डिलीट करना चाहते हैं?`)) return;

    let btn = document.getElementById("bulkDeleteBtn");
    let originalText = btn.innerHTML;
    btn.innerHTML = "⏳ Deleting...";
    btn.disabled = true;

    try {
        let deletePromises = [];
        let linkDeletePromises = [];

        checkboxes.forEach(chk => {
            let fileName = chk.value;
            const fileRef = storageRef(storage, `bills/${fileName}`);
            deletePromises.push(deleteObject(fileRef));

            let fileKey = fileName.replace("Bill_", "").replace(".pdf", "");
            linkDeletePromises.push(remove(ref(db, "billLinks/" + fileKey)));
        });

        await Promise.all(deletePromises);
        await Promise.all(linkDeletePromises);

        alert(`✅ शानदार! ${checkboxes.length} फाइलें सफलतापूर्वक डिलीट हो गईं!`);
        loadStorageFiles();
    } catch (error) {
        console.error("Bulk Delete Error: ", error);
        alert("कुछ फाइलों को डिलीट करने में एरर आया। Console चेक करें।");
        loadStorageFiles();
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
window.viewCloudFile = function (fileName) {
    // अब यह लिंक ढूँढने के लिए Cloud Storage में नहीं जाएगा, सीधे Database से लिंक उठा लेगा
    let fileKey = fileName.replace("Bill_", "").replace(".pdf", "");
    let url = billLinks[fileKey];

    if (url) {
        window.open(url, "_blank"); // पलक झपकते ही बिल खुल जाएगा!
    } else {
        alert("बिल का लिंक नहीं मिला! कृपया ऊपर 'Sync Links' बटन दबाएं।");
    }
}
window.deleteCloudFile = async function (fileName) {
    if (!confirm(`क्या आप सच में ${fileName} को हमेशा के लिए डिलीट करना चाहते हैं?`)) return;
    try {
        const fileRef = storageRef(storage, `bills/${fileName}`);
        await deleteObject(fileRef);
        let fileKey = fileName.replace("Bill_", "").replace(".pdf", "");
        await remove(ref(db, "billLinks/" + fileKey));
        alert(`✅ ${fileName} सफलतापूर्वक डिलीट हो गई है!`);
        loadStorageFiles();
    } catch (error) {
        console.error("Delete Error: ", error);
        alert("फाइल डिलीट करने में एरर आया।");
    }
}

window.shareCloudFile = async function (fileName) {
    try {
        // 🌟 NAYA CODE: Storage से पूछने की बजाय सीधा अपनी मेमोरी (billLinks) से फ्री में लिंक उठाना
        let fileKey = fileName.replace("Bill_", "").replace(".pdf", "");
        let url = billLinks[fileKey];

        if (!url) {
            alert("बिल का लिंक नहीं मिला! कृपया ऊपर 'Sync Links' बटन दबाएं।");
            return;
        }

        let billNoMatch = fileName.match(/SL_\d+/i);



        let billNo = billNoMatch ? billNoMatch[0].replace("_", "/") : "Bill";

        let mobile = await window.askMobileNumber(`Send ${billNo} via WhatsApp`);
        if (!mobile) return;

        mobile = mobile.replace(/\D/g, '');
        if (mobile.length < 10) { alert("कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें।"); return; }
        if (mobile.length > 10) mobile = mobile.slice(-10);

        let msg = `नमस्ते,\n\nहमारी फर्म RAVI KUMAR DEEPAK KUMAR की तरफ से यह आपके बिल (*${billNo}*) की कॉपी है।\n\nकृपया नीचे दिए गए लिंक पर क्लिक करके अपना बिल डाउनलोड करें:\n\n🔗 *बिल की कॉपी:* ${url}\n\nधन्यवाद,\nRAVI KUMAR DEEPAK KUMAR`;

        window.open("https://wa.me/91" + mobile + "?text=" + encodeURIComponent(msg));

    } catch (e) {
        alert("बिल का लिंक जनरेट करने में कोई एरर आया!");
        console.error(e);
    }
}

window.shareSelectedCloudFiles = async function () {
    let checkboxes = document.querySelectorAll(".storage-chk:checked");
    if (checkboxes.length === 0) {
        alert("कृपया शेयर करने के लिए कम से कम एक बिल सेलेक्ट करें!");
        return;
    }

    let mobile = await window.askMobileNumber(`Send ${checkboxes.length} Bills via WhatsApp`);
    if (!mobile) return;

    mobile = mobile.replace(/\D/g, '');
    if (mobile.length < 10) { alert("कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें।"); return; }
    if (mobile.length > 10) mobile = mobile.slice(-10);

    let btn = document.getElementById("bulkShareBtn");
    let originalText = btn.innerHTML;
    btn.innerHTML = "⏳ Merging PDF...";
    btn.disabled = true;

    try {




        if (checkboxes.length === 1) {
            let fileName = checkboxes[0].value;

            // 🌟 NAYA CODE: यहाँ भी Storage की जगह सीधा मेमोरी से फ्री लिंक उठाएं
            let fileKey = fileName.replace("Bill_", "").replace(".pdf", "");
            let url = billLinks[fileKey];

            if (!url) {
                alert("लिंक नहीं मिला! कृपया 'Sync Links' बटन दबाएं।");
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }




            let billNoMatch = fileName.match(/SL_\d+/i);
            let billNo = billNoMatch ? billNoMatch[0].replace("_", "/") : "Bill";

            let msg = `नमस्ते,\n\nहमारी फर्म RAVI KUMAR DEEPAK KUMAR की तरफ से यह आपके बिल (*${billNo}*) की कॉपी है।\n\nकृपया नीचे दिए गए लिंक पर क्लिक करके अपना बिल डाउनलोड करें:\n\n🔗 *बिल की कॉपी:* ${url}\n\nधन्यवाद,\nRAVI KUMAR DEEPAK KUMAR`;
            window.open("https://wa.me/91" + mobile + "?text=" + encodeURIComponent(msg));
        } else {
            const { PDFDocument } = window.PDFLib;
            const mergedPdf = await PDFDocument.create();
            let billNumbers = [];
            let count = 0;

            for (let chk of checkboxes) {
                let fileName = chk.value;
                let billNoMatch = fileName.match(/SL_\d+/i);
                if (billNoMatch) billNumbers.push(billNoMatch[0].replace("_", "/"));

                count++;
                btn.innerHTML = `⏳ Merging (${count}/${checkboxes.length})...`;

                const fileRef = storageRef(storage, `bills/${fileName}`);
                const fileArrayBuffer = await getBytes(fileRef);

                const pdfDoc = await PDFDocument.load(fileArrayBuffer);
                const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            }

            btn.innerHTML = "⏳ Uploading Link...";

            const mergedPdfBytes = await mergedPdf.save();
            let secureCode = Math.random().toString(36).substring(2, 10);
            let mergedFileName = `Merged_${billNumbers.length}_Bills_${secureCode}.pdf`;
            const mergedFileRef = storageRef(storage, `merged_bills/${mergedFileName}`);

            btn.innerHTML = "⏳ Uploading...";
            await uploadBytes(mergedFileRef, mergedPdfBytes);
            const mergedUrl = await getDownloadURL(mergedFileRef);

            let billsListText = billNumbers.join(", ");
            let msg = `नमस्ते,\n\nहमारी फर्म RAVI KUMAR DEEPAK KUMAR की तरफ से यह आपके *${checkboxes.length} बिलों* की संयुक्त (Combined) कॉपी है।\n*(बिल नं: ${billsListText})*\n\nकृपया नीचे दिए गए लिंक पर क्लिक करके सभी बिल एक ही PDF फाइल में प्राप्त करें:\n\n🔗 *सभी बिलों की कॉपी:* ${mergedUrl}\n\nधन्यवाद,\nRAVI KUMAR DEEPAK KUMAR`;

            window.open("https://wa.me/91" + mobile + "?text=" + encodeURIComponent(msg));
        }
    } catch (error) {
        console.error("Bulk Share Merge Error: ", error);
        alert("बिलों को मर्ज (Merge) करने में कोई दिक्कत आई। कृपया चेक करें कि इंटरनेट चल रहा है या नहीं।");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.cleanTempBills = async function () {
    if (!confirm("क्या आप WhatsApp पर शेयर की गई सभी Temporary (Merged) फाइलों को डिलीट करना चाहते हैं? (इससे आपके असली बिल्स सुरक्षित रहेंगे)")) return;

    try {
        const listRef = storageRef(storage, 'merged_bills');
        const res = await listAll(listRef);

        if (res.items.length === 0) {
            alert("कोई फालतू फाइल नहीं मिली। आपका स्टोरेज एकदम क्लीन है!");
            return;
        }

        let deletePromises = res.items.map(itemRef => deleteObject(itemRef));
        await Promise.all(deletePromises);

        alert(`✅ शानदार! ${res.items.length} फालतू Temporary फाइलें डिलीट कर दी गई हैं। आपका स्टोरेज बच गया!`);
    } catch (error) {
        console.error("Cleanup Error: ", error);
        alert("फाइलें डिलीट करने में कोई एरर आया। Console चेक करें।");
    }
}

// --- 9. REAL FIREBASE AUTHENTICATION LOGIC ---
window.loginFirebase = async function () {
    // .trim() लगाने से ईमेल के आगे-पीछे का फालतू Space अपने आप कट जाएगा!
    let email = document.getElementById("authEmail").value.trim();
    let password = document.getElementById("authPassword").value;
    let errorDiv = document.getElementById("authError");
    let btn = document.getElementById("loginBtn");

    if (!email || !password) return;

    btn.innerHTML = "⏳ Logging in...";
    btn.disabled = true;

    try {
        // Firebase Server से कनेक्ट करना
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        // अगर कोई एरर आता है, तो असली कारण पता लगाना
        console.error("Login Failed:", error.code, error.message);

        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorDiv.innerHTML = "❌ पासवर्ड गलत है! कृपया ध्यान से टाइप करें।";
        } else if (error.code === 'auth/user-not-found') {
            errorDiv.innerHTML = "❌ यह ईमेल सिस्टम में नहीं मिला!";
        } else if (error.code === 'auth/invalid-email') {
            errorDiv.innerHTML = "❌ ईमेल का फॉर्मेट गलत है!";
        } else {
            errorDiv.innerHTML = "❌ एरर: " + error.message; // कोई और एरर होगा तो स्क्रीन पर बता देगा
        }

        errorDiv.style.display = "block";
        btn.innerHTML = "Login 🔐";
        btn.disabled = false;
    }
};
window.logoutFirebase = async function () {
    if (confirm("क्या आप सच में Logout करना चाहते हैं?")) {
        await signOut(auth);
    }
};

// Enter बटन से भी लॉगिन हो जाए
document.getElementById("authPassword")?.addEventListener("keypress", function (e) {
    if (e.key === "Enter") window.loginFirebase();
});

// यह ऑटोमैटिक चेक करेगा कि आप Login हैं या Logout
onAuthStateChanged(auth, (user) => {
    let gateway = document.getElementById("firebaseAuthGateway");

    if (user) {
        // अगर सही यूज़र है तो स्क्रीन हटाकर डेटा लोड करो
        if (gateway) gateway.style.display = "none";
        loadData();
    } else {
        // अगर Logout हो गया है तो वापस लॉक स्क्रीन दिखाओ
        if (gateway) gateway.style.display = "flex";
        document.getElementById("authPassword").value = "";
        document.getElementById("loginBtn").innerHTML = "Login 🔐";
        document.getElementById("loginBtn").disabled = false;
        document.getElementById("authError").style.display = "none";
    }
});