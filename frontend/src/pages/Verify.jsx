import { useNavigate } from 'react-router';
import AppBar from '../components/AppBar.jsx';
import VerifyEmail from '../components/VerifyEmail.jsx';

export default function Verify() {
  const navigate = useNavigate();
  return (
    <>
      <AppBar title="Get verified" back="/profile" />
      <div className="screen">
        <div className="card">
          <h2>Show you’re a UTG student</h2>
          <p className="muted">Verify your university email to get the blue tick. Students are more likely to connect with verified profiles.</p>
          <VerifyEmail onVerified={() => setTimeout(() => navigate('/profile'), 1200)} />
        </div>
      </div>
    </>
  );
}
