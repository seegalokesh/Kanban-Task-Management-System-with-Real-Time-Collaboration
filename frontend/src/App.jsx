import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { io } from 'socket.io-client';

const API_URL = 'http://localhost:4000';

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth');
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const submit = async (e) => {
    e.preventDefault();
    const endpoint = mode === 'login' ? '/auth/login' : '/auth/signup';
    const response = await axios.post(`${API_URL}${endpoint}`, form);
    onAuth(response.data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-8">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold">Kanban Collaboration</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in or create an account to manage your board.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'signup' && <input className="w-full rounded bg-slate-800 p-2" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          <input className="w-full rounded bg-slate-800 p-2" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="w-full rounded bg-slate-800 p-2" placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <button className="w-full rounded bg-blue-600 p-2 font-semibold">{mode === 'login' ? 'Sign In' : 'Create Account'}</button>
        </form>
        <button className="mt-4 text-sm text-blue-400" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Need an account?' : 'Already have an account?'}</button>
      </div>
    </div>
  );
}

function Dashboard({ user, token, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [columns, setColumns] = useState([]);
  const [socket, setSocket] = useState(null);
  const [comments, setComments] = useState({});
  const [activeTask, setActiveTask] = useState(null);
  const [taskDraft, setTaskDraft] = useState({ title: '', description: '', columnId: '' });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFormVisible, setInviteFormVisible] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/projects`, { headers: { Authorization: `Bearer ${token}` } }).then((res) => setProjects(res.data));
  }, [token]);

  useEffect(() => {
    if (!selectedProject) return;
    setTaskDraft((prev) => ({ ...prev, columnId: columns[0]?.id || '' }));
    const s = io(API_URL, { auth: { token } });
    s.on('connect', () => {
      s.emit('join-project-room', selectedProject.id);
    });
    s.on('task:created', (payload) => setTasks((prev) => {
      const existingTask = prev.find((task) => task.id === payload.id);
      if (existingTask) {
        return prev.map((task) => (task.id === payload.id ? payload : task));
      }
      return [...prev, payload];
    }));
    s.on('task:moved', (payload) => setTasks((prev) => prev.map((task) => task.id === payload.id ? { ...task, column_id: payload.column_id, position: payload.position } : task)));
    s.on('comment:added', (payload) => setComments((prev) => ({ ...prev, [payload.task_id]: [...(prev[payload.task_id] || []), payload] })));
    setSocket(s);
    return () => s.disconnect();
  }, [selectedProject, token]);

  const loadBoard = async (project) => {
    setSelectedProject(project);
    const boardRes = await axios.get(`${API_URL}/projects/${project.id}/tasks`, { headers: { Authorization: `Bearer ${token}` } });
    setColumns(boardRes.data.columns || []);
    setTasks(boardRes.data.tasks || []);
    setTaskDraft({ title: '', description: '', columnId: (boardRes.data.columns || [])[0]?.id || '' });
    setInviteFormVisible(false);
    setInviteEmail('');
  };

  const createProject = async (e) => {
    e.preventDefault();
    const res = await axios.post(`${API_URL}/projects`, { name: projectName }, { headers: { Authorization: `Bearer ${token}` } });
    setProjects((prev) => [...prev, res.data]);
    setProjectName('');
  };

  const deleteProject = async () => {
    if (!selectedProject) return;
    if (!window.confirm('Delete this project? This cannot be undone.')) return;

    try {
      const remainingProjects = projects.filter((project) => project.id !== selectedProject.id);
      await axios.delete(`${API_URL}/projects/${selectedProject.id}`, { headers: { Authorization: `Bearer ${token}` } });
      setProjects(remainingProjects);
      setComments({});

      if (remainingProjects.length > 0) {
        await loadBoard(remainingProjects[0]);
      } else {
        setSelectedProject(null);
        setTasks([]);
        setColumns([]);
      }
    } catch (error) {
      console.error('Delete project failed:', error.response?.data || error.message);
      alert(error.response?.data?.error || 'Unable to delete project');
    }
  };

  const inviteMember = async (e) => {
    if (e) e.preventDefault();
    if (!selectedProject || !inviteEmail) return;

    try {
      await axios.post(
        `${API_URL}/projects/${selectedProject.id}/members`,
        { email: inviteEmail },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInviteEmail('');
      setInviteFormVisible(false);
      alert('Invitation sent');
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.error || 'Unable to invite member');
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    if (!selectedProject || !taskDraft.title) return;

    try {
      const res = await axios.post(
        `${API_URL}/projects/${selectedProject.id}/tasks`,
        { ...taskDraft, columnId: taskDraft.columnId || columns[0]?.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTasks((prev) => [...prev, res.data]);
      setTaskDraft({ title: '', description: '', columnId: columns[0]?.id || '' });
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.error || 'Unable to create task');
    }
  };

  const updateTask = async (e) => {
    e.preventDefault();
    if (!activeTask || !selectedProject) return;

    try {
      const res = await axios.patch(
        `${API_URL}/projects/${selectedProject.id}/tasks/${activeTask.id}`,
        { title: activeTask.title, description: activeTask.description, priority: activeTask.priority },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTasks((prev) => {
        const updated = prev.map((task) => (task.id === activeTask.id ? res.data : task));
        setSelectedProject((prevProject) => ({ ...prevProject }));
        return updated;
      });
      setActiveTask(res.data);
      alert('Task saved');
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.error || 'Unable to save task');
    }
  };

  const deleteTask = async () => {
    if (!activeTask || !selectedProject) return;
    await axios.delete(`${API_URL}/projects/${selectedProject.id}/tasks/${activeTask.id}`, { headers: { Authorization: `Bearer ${token}` } });
    setTasks((prev) => prev.filter((task) => task.id !== activeTask.id));
    setActiveTask(null);
  };

  const onDragEnd = async (result) => {
    if (!result.destination || !selectedProject) return;
    const sourceColumnId = result.source.droppableId;
    const destinationColumnId = result.destination.droppableId;
    const task = tasks.find((item) => item.id === result.draggableId);
    if (!task) return;

    const newTasks = tasks.filter((item) => item.id !== task.id);
    const destinationTasks = newTasks.filter((item) => item.column_id === destinationColumnId);
    const updatedTask = { ...task, column_id: destinationColumnId, position: result.destination.index };
    const optimistic = [...newTasks, updatedTask].sort((a, b) => a.position - b.position);
    setTasks(optimistic);

    try {
      await axios.patch(`${API_URL}/projects/${selectedProject.id}/tasks/${task.id}/move`, { columnId: destinationColumnId, position: result.destination.index }, { headers: { Authorization: `Bearer ${token}` } });
      if (socket) socket.emit('task:moved', { id: task.id, column_id: destinationColumnId, position: result.destination.index, projectId: selectedProject.id });
    } catch {
      setTasks(tasks);
    }
  };

  const openTask = async (task) => {
    setActiveTask(task);
    const res = await axios.get(`${API_URL}/projects/${selectedProject.id}/tasks/${task.id}/comments`, { headers: { Authorization: `Bearer ${token}` } });
    setComments((prev) => ({ ...prev, [task.id]: res.data }));
  };

  const addComment = async (e) => {
    e.preventDefault();
    const input = e.target.elements.comment;
    if (!input.value || !activeTask) return;
    const res = await axios.post(`${API_URL}/projects/${selectedProject.id}/tasks/${activeTask.id}/comments`, { content: input.value }, { headers: { Authorization: `Bearer ${token}` } });
    setComments((prev) => ({ ...prev, [activeTask.id]: [...(prev[activeTask.id] || []), res.data] }));
    input.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Projects</h1>
          <p className="text-slate-400">Welcome {user.name}</p>
        </div>
        <div className="flex gap-2">
          <form onSubmit={createProject} className="flex gap-2">
            <input className="rounded bg-slate-900 p-2" placeholder="Project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            <button className="rounded bg-blue-600 px-4 py-2">Create</button>
          </form>
          <button type="button" onClick={onLogout} className="rounded bg-rose-600 px-4 py-2">Logout</button>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="font-semibold">Your projects</h2>
          <div className="mt-4 space-y-2">
            {projects.map((project) => (
              <button key={project.id} onClick={() => loadBoard(project)} className="block w-full rounded bg-slate-800 p-2 text-left">
                {project.name}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          {selectedProject ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{selectedProject.name}</h2>
                  <p className="text-sm text-slate-400">Realtime board</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setInviteFormVisible((prev) => !prev)} className="rounded bg-emerald-600 px-3 py-2 text-sm">Invite member</button>
                  <button type="button" onClick={deleteProject} className="rounded bg-rose-600 px-3 py-2 text-sm">Delete project</button>
                </div>
              </div>
              {inviteFormVisible && (
                <form onSubmit={inviteMember} className="mb-4 flex gap-2">
                  <input
                    className="rounded bg-slate-800 p-2"
                    placeholder="Invite email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <button type="submit" className="rounded bg-emerald-600 px-3 py-2 text-sm">Send invite</button>
                </form>
              )}
              <form onSubmit={createTask} className="mb-4 flex gap-2">
                <input className="rounded bg-slate-800 p-2" placeholder="Task title" value={taskDraft.title} onChange={(e) => setTaskDraft((prev) => ({ ...prev, title: e.target.value }))} />
                <input className="rounded bg-slate-800 p-2" placeholder="Short description" value={taskDraft.description} onChange={(e) => setTaskDraft((prev) => ({ ...prev, description: e.target.value }))} />
                <select className="rounded bg-slate-800 p-2" value={taskDraft.columnId} onChange={(e) => setTaskDraft((prev) => ({ ...prev, columnId: e.target.value }))}>
                  {columns.map((column) => (<option key={column.id} value={column.id}>{column.title}</option>))}
                </select>
                <button className="rounded bg-blue-600 px-3 py-2">Add task</button>
              </form>
              <DragDropContext onDragEnd={onDragEnd}>
                <div className="grid gap-4 xl:grid-cols-5">
                  {columns.map((column) => (
                    <Droppable key={column.id} droppableId={column.id}>
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="min-h-[240px] rounded-lg border border-slate-800 bg-slate-950 p-3">
                          <h3 className="mb-3 font-semibold">{column.title}</h3>
                          <div className="space-y-2">
                            {tasks.filter((task) => task.column_id === column.id).map((task, index) => (
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(provided) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={() => openTask(task)} className="cursor-pointer rounded bg-slate-800 p-3 shadow">
                                    <div className="text-sm font-medium">{task.title}</div>
                                    <div className="mt-2 text-xs text-slate-400">{task.priority}</div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}
                    </Droppable>
                  ))}
                </div>
              </DragDropContext>
            </>
          ) : (
            <div className="text-slate-400">Select a project to open the board.</div>
          )}
        </div>
      </div>
      {activeTask && (
        <div className="fixed inset-0 z-20 flex items-end justify-end bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">{activeTask.title}</h3>
              <button onClick={deleteTask} className="rounded bg-rose-600 px-3 py-2 text-sm">Delete</button>
            </div>
            <form onSubmit={updateTask} className="mt-4 space-y-2">
              <input className="w-full rounded bg-slate-800 p-2" value={activeTask.title || ''} onChange={(e) => setActiveTask((prev) => ({ ...prev, title: e.target.value }))} />
              <textarea className="w-full rounded bg-slate-800 p-2" value={activeTask.description || ''} onChange={(e) => setActiveTask((prev) => ({ ...prev, description: e.target.value }))} />
              <select className="w-full rounded bg-slate-800 p-2" value={activeTask.priority || 'medium'} onChange={(e) => setActiveTask((prev) => ({ ...prev, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <button className="rounded bg-blue-600 px-3 py-2">Save</button>
            </form>
            <form onSubmit={addComment} className="mt-4">
              <input name="comment" className="w-full rounded bg-slate-800 p-2" placeholder="Add comment" />
              <button className="mt-2 rounded bg-blue-600 px-3 py-2">Comment</button>
            </form>
            <div className="mt-4 space-y-2">
              {(comments[activeTask.id] || []).map((comment) => (
                <div key={comment.id} className="rounded bg-slate-800 p-2 text-sm">{comment.content}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => JSON.parse(localStorage.getItem('auth') || 'null'));

  useEffect(() => {
    if (auth) localStorage.setItem('auth', JSON.stringify(auth));
  }, [auth]);

  const handleLogout = () => {
    setAuth(null);
    localStorage.removeItem('auth');
    window.location.href = '/auth';
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={auth ? <Dashboard user={auth.user} token={auth.token} onLogout={handleLogout} /> : <Navigate to="/auth" replace />} />
        <Route path="/auth" element={auth ? <Navigate to="/" replace /> : <AuthPage onAuth={setAuth} />} />
      </Routes>
    </BrowserRouter>
  );
}
