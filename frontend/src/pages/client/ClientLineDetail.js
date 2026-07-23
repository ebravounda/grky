import { useParams } from "react-router-dom";
import LinePanel from "@/components/LinePanel";

export default function ClientLineDetail() {
  const { lineNumber } = useParams();
  return <LinePanel lineNumber={lineNumber} backLink="/portal" backLabel="Mi cuenta" />;
}
