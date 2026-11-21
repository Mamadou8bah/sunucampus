/**
 * Full-screen launch screen, shown while the app checks the saved session.
 * index.html contains the same markup so it appears before any JavaScript runs.
 */
export default function Splash() {
  return (
    <div className="splash" role="status" aria-label="Loading SunuCampus">
      <img src="/brand/sunucampus-mark.png" alt="" className="splash-mark" width="132" height="132" />
      <p className="splash-word">
        Sunu<span>Campus</span>
      </p>
      <p className="splash-tag">The University of The Gambia</p>
    </div>
  );
}
