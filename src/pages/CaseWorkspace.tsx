import { useParams, Navigate } from "react-router-dom";

const CaseWorkspace = () => {
  const { id } = useParams();
  if (id) return <Navigate to={`/agent/source-of-wealth?caseId=${id}`} replace />;
  return <Navigate to="/dashboard" replace />;
};

export default CaseWorkspace;
