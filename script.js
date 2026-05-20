// ─────────────────────────────────────────
// PASTE YOUR FIREBASE CONFIG HERE
// ─────────────────────────────────────────
const firebaseConfig = {
apiKey: "AIzaSyBx1kFEm22B8DeIL5-WkEm-8O36xytSJHc",
authDomain: "messaging-app-5b679.firebaseapp.com",
projectId: "messaging-app-5b679",
storageBucket: "messaging-app-5b679.firebasestorage.app",
messagingSenderId: "539789419555",
appId: "1:539789419555:web:d050bf913ef262e45e3d96",
measurementId: "G-3FEBCW605E"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

//── State ──
let currentUser = null;
let currentRoom = "general";
let messagesUnsubscribe = null;
let typingUnsubscribe = null;
let typingTimeout = null;

// ── DOM refs ──
const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const usernameInput = document.getElementById("username-input");
const joinBtn = document.getElementById("join-btn");
const messagesEl = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const roomItems = document.querySelectorAll(".room");
const roomTitle = document.getElementById("room-title");
const typingIndicator = document.getElementById("typing-indicator");
const onlineCount = document.getElementById("online-count");
const currentUserLabel = document.getElementById("current-user-label");
const logoutBtn = document.getElementById("logout-btn");

//─────────────────────────────────────────
// JOIN
// ─────────────────────────────────────────
joinBtn.addEventListener("click", joinChat);
usernameInput.addEventListener("keydown", e => e.key === "Enter" && joinChat());

function joinChat(){
    const name = usernameInput.value.trim();
    if (!name) return;

    currentUser = name;
    currentUserLabel.textContent = name;
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");

    registerPresence();
    switchRoom("general");
    listenToOnlineUsers();
}

//─────────────────────────────────────────
// PRESENCE (online users count)
// ─────────────────────────────────────────
function registerPresence() {
    const ref = db.collection("presence").doc(currentUser);
    ref.set({ name: currentUser, online: true, lastSeen: firebase.firestore.FieldValue.serverTimestamp() });

    //Mark offline when tab closes
    window.addEventListener("beforeunload", () => {
        ref.set({online: false});
        clearTyping();
    });
}

function listenToOnlineUsers(){
    db.collection("presence").where("online", "==", true)
    .onSnapshot(snap => {
        onlineCount.textContent = `${snap.size} online`;
    });
}

//─────────────────────────────────────────
// ROOMS
// ─────────────────────────────────────────
roomItems.forEach(item => {
    item.addEventListener("click", () => {
        const room = item.dataset.room;
        if (room === currentRoom) return;

        roomItems.forEach(r => r.classList.remove("active"));
        item.classList.add("active");
        switchRoom(room);
    });
});

function switchRoom(room){
    clearTyping();

    //Unsubscribe Old Listeners
    if (messagesUnsubscribe) messagesUnsubscribe();
    if (typingUnsubscribe) typingUnsubscribe();

    currentRoom = room;
    roomTitle.textContent = `#${room}`;
    messagesEl.innerHTML = "";

    listenToMessages();
    listenToTyping();
}

//─────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", e => {
    if (e.key === "Enter") sendMessage();
});

function sendMessage(){
    const text = messageInput.value.trim();
    if (!text) return;

    db.collection("rooms").doc(currentRoom).collection("messages").add({
        text,
        sender: currentUser,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });

    messageInput.value = "";
    clearTyping();
}

function listenToMessages(){
    messagesUnsubscribe = db
    .collection("rooms").doc(currentRoom).collection("messages")
    .orderBy("timestamp", "asc")
    .limitToLast(100)
    .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added"){
                renderMessage(change.doc.data());
            }
        });
        scrollToBottom();
    });
}
function renderMessage(data){
    if (!data.timestamp) return; //Skip optimistic writes mid-flight

    const isOwn = data.sender === currentUser;
    const time = data.timestamp.toDate().toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});

    const div = document.createElement("div");
    div.className = `message ${isOwn ? "own" : "other"}`;
    div.innerHTML = `
    <div class="meta">${isOwn ? "You" : data.sender} · ${time}</div>
    <div class="bubble">${escapeHTML(data.text)}</div>
    `;
    messages.appendChild(div);
}
function scrollToBottom(){
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHTML(str){
    return str.replace(/&/g, "&amp;").replace(/>/g, "&gt;");
}

//─────────────────────────────────────────
// TYPING INDICATOR
// ─────────────────────────────────────────
messageInput.addEventListener("input", () => {
    const ref = db.collection("rooms").doc(currentRoom)
    .collection("typing").doc(currentUser);
    ref.set({ name: currentUser, typing: true });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        ref.set({typing: false});
    }, 2000);
});

function listenToTyping(){
    typingUnsubscribe = db
    .collection("rooms").doc(currentRoom).collection("typing")
    .where("typing", "==", true)
    .onSnapshot(snap => {
        const others = snap.docs
        .map(d => d.data().name)
        .filter(name => name !== currentUser);

        if (others.length === 0){
            typingIndicator.textContent = "";
        } else if (others.length === 1) {
            typingIndicator.textContent = `${others[0]} is typing…`;
        } else {
            typingIndicator.textContent = `${others.join(", ")} are typing…`;
        }
    });
}

function clearTyping(){
    if (!currentUser || !currentRoom) return;
    db.collection("rooms").doc(currentRoom)
    .collection("typing").doc(currentUser)
    .set({ typing: false });
    clearTimeout(typingTimeout);
    typingIndicator.textContent = "";
}

//─────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────
logoutBtn.addEventListener("click", () => {
    clearTyping();
    db.collection("presence").doc(currentUser).set({ online: false });
    if (messagesUnsubscribe) messagesUnsubscribe();
    if (typingUnsubscribe) typingUnsubscribe();

    currentUser = null;
    chatScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    usernameInput.value = "";
    messagesEl.innerHTML = "";
});