import { createGraphNodeClient } from '../z_npm_sdk/dist/index.js';

// 1. 클라이언트 초기화 (로컬 백엔드 주소)
const client = createGraphNodeClient({

});

// UI 헬퍼
const output = document.getElementById('output-area');
function log(data, isError = false) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const className = isError ? 'error-msg' : 'success-msg';
    output.innerHTML = `<span style="color: #888">[${timestamp}]</span> <span class="${className}">${content}</span>\n\n` + output.innerHTML;
}

function handleError(err) {
    console.error(err);
    if (err.response) {
        // SDK HttpError
        err.response.json().then(body => {
            log({ status: err.status, problem: body }, true);
        }).catch(() => {
            log({ status: err.status, statusText: err.statusText }, true);
        });
    } else {
        log(err.message || err, true);
    }
}

// --- Event Listeners ---

// Auth
document.getElementById('btn-login-google').onclick = () => {
    // SDK의 login 메서드는 window.location.href를 변경함
    client.googleAuth.login();
};

document.getElementById('btn-me').onclick = async () => {
    try {
        const me = await client.me.get();
        log(me);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-logout').onclick = async () => {
    try {
        await client.me.logout();
        log("Logged out successfully");
    } catch (e) { handleError(e); }
};

// Health
document.getElementById('btn-health').onclick = async () => {
    try {
        const res = await client.health.get();
        log(res);
    } catch (e) { handleError(e); }
};

// Conversations
document.getElementById('btn-list-conv').onclick = async () => {
    try {
        const list = await client.conversations.list();
        log(list);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-create-conv').onclick = async () => {
    const title = document.getElementById('inp-conv-title').value;
    // FE에서 ID 생성 (UUID)
    const id = crypto.randomUUID();
    
    try {
        const res = await client.conversations.create({ 
            id: id,
            title: title || "New Conversation" 
        });
        log(res);
        // 편의를 위해 ID 입력창에 자동 채움
        document.getElementById('inp-conv-id').value = res.id;
    } catch (e) { handleError(e); }
};

document.getElementById('btn-get-conv').onclick = async () => {
    const id = document.getElementById('inp-conv-id').value;
    if (!id) return alert('ID required');
    try {
        const res = await client.conversations.get(id);
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-del-conv').onclick = async () => {
    const id = document.getElementById('inp-conv-id').value;
    if (!id) return alert('ID required');
    try {
        const res = await client.conversations.delete(id);
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-create-msg').onclick = async () => {
    const id = document.getElementById('inp-conv-id').value;
    const content = document.getElementById('inp-msg-content').value;
    if (!id || !content) return alert('ID and Content required');
    
    // FE에서 ID 및 타임스탬프 생성
    const msgId = crypto.randomUUID();
    const ts = new Date().toISOString();

    try {
        const res = await client.conversations.createMessage(id, {
            id: msgId,
            role: 'user',
            content: content,
            ts: ts
        });
        log(res);
    } catch (e) { handleError(e); }
};

// Graph
document.getElementById('btn-graph-stats').onclick = async () => {
    try {
        const res = await client.graph.getStats();
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-list-nodes').onclick = async () => {
    try {
        const res = await client.graph.listNodes();
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-list-edges').onclick = async () => {
    try {
        const res = await client.graph.listEdges();
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-list-clusters').onclick = async () => {
    try {
        const res = await client.graph.listClusters();
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-create-node').onclick = async () => {
    try {
        const json = document.getElementById('inp-node-json').value;
        const payload = JSON.parse(json);
        const res = await client.graph.createNode(payload);
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-get-node').onclick = async () => {
    const id = document.getElementById('inp-node-id').value;
    if (!id) return alert('Node ID required');
    try {
        const res = await client.graph.getNode(Number(id));
        log(res);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-del-node').onclick = async () => {
    const id = document.getElementById('inp-node-id').value;
    if (!id) return alert('Node ID required');
    try {
        await client.graph.deleteNode(Number(id));
        log(`Node ${id} deleted`);
    } catch (e) { handleError(e); }
};

document.getElementById('btn-create-edge').onclick = async () => {
    try {
        const json = document.getElementById('inp-edge-json').value;
        const payload = JSON.parse(json);
        const res = await client.graph.createEdge(payload);
        log(res);
    } catch (e) { handleError(e); }
};
