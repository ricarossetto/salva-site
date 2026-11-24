const port = Number(process.argv[2]);
const targetType = process.argv[3] || "page";
const expression = process.argv.slice(4).join(" ") || "location.href";
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find((item) => item.type === targetType);
if (!target) throw new Error(`Alvo não encontrado: ${targetType}`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const response = await new Promise((resolve, reject) => {
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === 1) resolve(message.result);
  });
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: { expression, awaitPromise: true, returnByValue: true }
  }));
  setTimeout(() => reject(new Error("Tempo esgotado")), 10000);
});
socket.close();
console.log(JSON.stringify(response, null, 2));
