
const priorityColors = { High: "red", Medium: "yellow", Low: "green" };

const NoticeCard = ({ title, body, priority }) => (
  <div className="bg-white/10 rounded-xl p-4 mb-3">
    <span className={`text-${priorityColors[priority]}-400 text-xs font-bold uppercase`}>{priority}</span>
    <h3 className="text-white font-semibold mt-1">{title}</h3>
    <p className="text-gray-300 text-sm mt-1">{body}</p>
  </div>
);
