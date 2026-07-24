import { useParams } from "react-router-dom";
import LinePanel from "@/components/LinePanel";

export default function ClientLineDetail() {
  const { lineNumber } = useParams();
  return <div className="px-5 py-6"><LinePanel lineNumber={lineNumber} backLink="/portal" backLabel="Mi cuenta" /></div>;
}
