/** Lässt einen „+X €"-Text an der Klickposition aufsteigen und verblassen. */
export function floatMoney(amount: number, x: number, y: number): void {
  const el = document.createElement("div");
  el.className = "float-money";
  el.textContent = `+${amount} €`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}
