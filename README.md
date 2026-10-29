# NafChess Analyzer

Build a modern, fully responsive, client-side web application for analyzing chess games from PGN (Portable Game Notation) strings, inspired by platforms like Chessigma and Lichess and Chess.com. The Site name will be "NafChessLog"

### Technology Stack:
- **Frontend:** HTML5, CSS3 (Tailwind CSS for UI styling), JavaScript/TypeScript.
- **Chess Logic:** `chess.js` (for move validation, PGN parsing, and board state management).
- **UI Board:** `react-chessboard` or `cm-chessboard` for smooth piece dragging and position rendering.
- **Engine Analysis:** Local/WebWorker Stockfish integration (or a client-side evaluation mock fallback) to run position analysis directly in the browser.

---

### Core Functional Requirements:

1. **Game Ingestion & Parsing:**
   - **PGN Input:** Textarea supporting copy-pasted PGN text with a "Review Game" action button.
   - **Header Extraction:** Parse and display game metadata (Player names, Elo ratings, Result, Date, Opening name, Time control).
   - **Error Handling:** Gracefully validate corrupt or invalid PGN inputs with clear user error messages.

2. **Interactive Board & Navigation:**
   - **Board Features:** High-resolution chess pieces, highlighted last move, move hint highlights, and board flipping (White/Black view).
   - **Controls Panel:** 
     - Interactive buttons: `|<` (Start), `<` (Previous), `>` (Next), `>|` (End).
     - Keyboard navigation: Left Arrow (Previous), Right Arrow (Next), Up Arrow (Start), Down Arrow (End).
     - Move sound effects for normal moves, captures, checks, and game end.

3. **Analysis Engine & Evaluation Bar:**
   - **Evaluation Bar:** A vertical bar alongside the board showing real-time centipawn advantage (e.g., +2.4 or -1.1) or mate sequences (e.g., M3), dynamically shifting as the user steps through moves.
   - **Move Classification:** Calculate centipawn loss per turn and categorize player moves using distinct badges:
     - 🟨 **Brilliant / Great** (Significant advantage boost or tactical sacrifice)
     - 🟩 **Best / Good** (Engine top choice or low centipawn loss)
     - 🟨 **Inaccuracy** (Minor evaluation drop, e.g., 50–100 CP loss)
     - 🟧 **Mistake** (Moderate evaluation drop, e.g., 100–200 CP loss)
     - 🟥 **Blunder** (Major evaluation drop, e.g., >200 CP loss)
   - **Suggested Lines:** Show the top 1–2 engine-recommended continuation moves for the current position.

4. **Move History & Summary Dashboard:**
   - **Move List:** Dual-column scrollable move table in standard algebraic notation (SAN). Clicking any move instantly jumps the board to that ply.
   - **Accuracy Summary:** Display overall percentage accuracy scores for White and Black calculated from move classifications.

---

### UI & Layout Specifications:

- **Theme:** Modern dark mode with slate/zinc dark backgrounds (`bg-slate-900`), muted borders, accent colors for best moves, and high contrast for readability.
- **Desktop Layout:** 
  - Left column: Vertical Evaluation Bar + Interactive Chessboard.
  - Right column: PGN Input panel (collapsible after load), Game Metadata Header, Overall Accuracy stats, Top Engine Moves, and the Scrollable Move History table.
- **Mobile Layout:** Single-column stacked layout with the Chessboard on top, evaluation bar horizontal beneath it, navigation buttons, and scrollable move history at the bottom.

---

### Footer & Branding Requirements:

- Centered at the bottom of the page, clean and unobtrusive footer section:
  - **Developer Info:** "Built by Md. Nafim Muttaki • Portfolio(https://nafim.vercel.app0 • 
  - **Support / Sponsorship:** "Enjoying the tool? Buy Me a Coffee(https://buymeacoffee.com/mdnafimmuttaki) "
  - **Open Source Attribution:** "Powered by chess.js and Stockfish WASM."

Provide clean, modular, and fully functional single-page or component code implementing this specification.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bf165180-f719-4f3d-a42d-83e037809f94).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
