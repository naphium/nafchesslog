import { Chessboard } from "react-chessboard";

type Props = {
  fen: string;
  orientation: "white" | "black";
  lastMove?: { from: string; to: string };
  hint?: { from: string; to: string };
};

export default function Board({ fen, orientation, lastMove, hint }: Props) {
  const styles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    styles[lastMove.from] = { background: "var(--board-highlight)" };
    styles[lastMove.to] = { background: "var(--board-highlight)" };
  }
  return (
    <Chessboard
      id="naf-board"
      position={fen}
      boardOrientation={orientation}
      arePiecesDraggable={false}
      animationDuration={180}
      customSquareStyles={styles}
      customDarkSquareStyle={{ backgroundColor: "var(--board-dark)" }}
      customLightSquareStyle={{ backgroundColor: "var(--board-light)" }}
      customArrows={hint ? [[hint.from as never, hint.to as never, "rgba(80, 200, 120, 0.8)"]] : []}
      customBoardStyle={{ borderRadius: "6px", boxShadow: "var(--shadow-board)" }}
    />
  );
}
