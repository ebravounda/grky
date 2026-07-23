import { useParams } from "react-router-dom";
import LinePanel from "@/components/LinePanel";

export default function LineDetail() {
  const { lineNumber } = useParams();
  return <LinePanel lineNumber={lineNumber} backLink="/app/lines" backLabel="Líneas" />;
}
