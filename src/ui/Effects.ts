/** Lässt einen „+X €"-Text an der Klickposition aufsteigen und verblassen. */
export function floatMoney(amount: number, x: number, y: number): void {
  floatText(`+${amount} €`, x, y, "float-money");
}

/** Lässt einen „+X 🎃"-Text an der Klickposition aufsteigen und verblassen. */
export function floatPumpkins(amount: number, x: number, y: number): void {
  floatText(`+${amount} 🎃`, x, y, "float-money float-pumpkins");
}

function floatText(text: string, x: number, y: number, className: string): void {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}
