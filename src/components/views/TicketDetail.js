import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, MessageSquare, FileText, Paperclip, Smile, Send, Image, Link, Video, AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, Bold, Italic, Underline, Strikethrough, X } from 'lucide-react';
import Button from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';

export default function TicketDetail({ ticket, onBack, onReplyAdded }) {
  const { user } = useAuth();
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReplyEditor, setShowReplyEditor] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [replyForm, setReplyForm] = useState({
    reply_text: '',
    reply_type: 'customer_reply',
    is_internal: false,
    attachments: []
  });
  
  // Track if we've already marked this ticket as read to prevent multiple calls
  const hasMarkedAsRead = useRef(false);
  const hasFetchedReplies = useRef(false);
  const previousTicketId = useRef(null);

  useEffect(() => {
    if (ticket?.id) {
      console.log('TicketDetail useEffect triggered for ticket:', ticket.id, 'Previous:', previousTicketId.current);
      
      // Only reset flags if ticket ID actually changed
      if (previousTicketId.current !== ticket.id) {
        console.log('Ticket ID changed, resetting flags');
        hasMarkedAsRead.current = false;
        hasFetchedReplies.current = false;
        previousTicketId.current = ticket.id;
      }
      
      // Fetch replies only once per ticket
      if (!hasFetchedReplies.current) {
        console.log('Fetching replies for ticket:', ticket.id);
        fetchReplies();
        hasFetchedReplies.current = true;
      }
      
      // Mark ticket as read when viewing (only once per ticket)
      if (!hasMarkedAsRead.current) {
        console.log('Marking ticket as read:', ticket.id);
        markTicketAsRead();
        hasMarkedAsRead.current = true;
      }
    }
  }, [ticket?.id]); // Only depend on ticket.id, not the entire ticket object

  // Mark ticket as read and update related notifications
  const markTicketAsRead = async () => {
    if (!user?.id || !ticket?.id) {
      console.log('Cannot mark ticket as read: missing user or ticket data');
      return;
    }
    
    try {
      const response = await fetch(`/api/notifications/mark-ticket-read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: user.id, 
          ticket_id: ticket.id 
        })
      });
      
      if (response.ok) {
        console.log('Notifications marked as read for ticket:', ticket.id);
        
        // Don't dispatch any events from detail view to prevent refresh loops
        // The notification components will update via their own polling
      }
    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
  };

  const fetchReplies = async () => {
    if (!ticket?.id) {
      console.log('Cannot fetch replies: no ticket ID');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch(`/api/tickets/${ticket.id}/replies`);
      if (response.ok) {
        const data = await response.json();
        setReplies(data);
      }
    } catch (err) {
      console.error('Error fetching replies:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddReply = async () => {
    if (!replyForm.reply_text.trim()) {
      alert('Please enter a reply message');
      return;
    }

    try {
      // Create FormData for file uploads
      const formData = new FormData();
      formData.append('reply_text', replyForm.reply_text);
      formData.append('reply_type', replyForm.reply_type);
      formData.append('is_internal', replyForm.is_internal);
      formData.append('replied_by', user.id);
      formData.append('replied_by_name', user.name);

      // Add attachments if any
      replyForm.attachments.forEach((file, index) => {
        formData.append(`attachment_${index}`, file);
      });

      const response = await fetch(`/api/tickets/${ticket.id}/replies`, {
        method: 'POST',
        body: formData // Don't set Content-Type header, let browser set it for FormData
      });

      if (response.ok) {
        const newReply = await response.json();
        setReplies(prev => [...prev, newReply]);
        setReplyForm({
          reply_text: '',
          reply_type: 'customer_reply',
          is_internal: false,
          attachments: []
        });
        setShowReplyEditor(false);
        if (onReplyAdded) onReplyAdded();
        
        // Dispatch event to notify parent that a reply was added
        // This will trigger the ticket list refresh to move the ticket to unread section
        window.dispatchEvent(new CustomEvent('ticketReplyAdded', {
          detail: { ticketId: ticket.id, userId: user.id }
        }));
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Failed to add reply: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error adding reply:', err);
      alert('Failed to add reply');
    }
  };

  const handleAddNote = async () => {
    if (!replyForm.reply_text.trim()) {
      alert('Please enter a note message');
      return;
    }

    try {
      // Create FormData for file uploads
      const formData = new FormData();
      formData.append('reply_text', replyForm.reply_text);
      formData.append('reply_type', 'internal_note');
      formData.append('is_internal', 'true');
      formData.append('replied_by', user.id);
      formData.append('replied_by_name', user.name);

      // Add attachments if any
      replyForm.attachments.forEach((file, index) => {
        formData.append(`attachment_${index}`, file);
      });

      const response = await fetch(`/api/tickets/${ticket.id}/replies`, {
        method: 'POST',
        body: formData // Don't set Content-Type header, let browser set it for FormData
      });

      if (response.ok) {
        const newReply = await response.json();
        setReplies(prev => [...prev, newReply]);
        setReplyForm({
          reply_text: '',
          reply_type: 'customer_reply',
          is_internal: false,
          attachments: []
        });
        setShowNoteEditor(false);
        if (onReplyAdded) onReplyAdded();
        
        // Dispatch event to notify parent that a note was added
        // This will trigger the ticket list refresh to move the ticket to unread section
        window.dispatchEvent(new CustomEvent('ticketReplyAdded', {
          detail: { ticketId: ticket.id, userId: user.id }
        }));
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Failed to add note: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error adding note:', err);
      alert('Failed to add note');
    }
  };

  const handleFileUpload = () => {
    // Create a hidden file input element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.zip,.rar';
    
    fileInput.onchange = (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        handleFilesSelected(files);
      }
    };
    
    fileInput.click();
  };

  const handleFilesSelected = (files) => {
    // Add files to the reply form attachments
    setReplyForm(prev => ({
      ...prev,
      attachments: [...prev.attachments, ...files]
    }));
  };

  const removeAttachment = (index) => {
    setReplyForm(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Critical': return 'bg-red-100 text-red-800';
      case 'High': return 'bg-orange-100 text-orange-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Open': return 'bg-blue-100 text-blue-800';
      case 'In Progress': return 'bg-yellow-100 text-yellow-800';
      case 'Resolved': return 'bg-green-100 text-green-800';
      case 'Closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="secondary" onClick={onBack} size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{ticket.title}</h1>
              <p className="text-sm text-gray-500">Ticket #{ticket.ticket_number}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
              {ticket.priority}
            </span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
              {ticket.status}
            </span>
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Original Ticket Message */}
        <div className="flex justify-start">
          <div className="max-w-3xl">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-900">{ticket.created_by_name}</span>
                  <span className="text-xs text-gray-500">•</span>
                  <span className="text-xs text-gray-500">{formatDate(ticket.created_at)}</span>
                </div>
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Original Ticket
                </span>
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</div>
            </div>
          </div>
        </div>

        {/* Replies */}
        {replies.map((reply) => (
          <div key={reply.id} className={`flex ${reply.is_internal ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-3xl">
              <div className={`border rounded-lg p-4 ${
                reply.is_internal 
                  ? 'bg-yellow-50 border-yellow-200' 
                  : 'bg-white border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-900">{reply.replied_by_name}</span>
                    {reply.is_internal && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Internal
                      </span>
                    )}
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {reply.reply_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{formatDate(reply.created_at)}</span>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">{reply.reply_text}</div>
              </div>
            </div>
          </div>
        ))}

        {/* Reply Editor */}
        {showReplyEditor && (
          <div className="flex justify-start">
            <div className="max-w-3xl w-full">
              <ReplyEditor
                form={replyForm}
                setForm={setReplyForm}
                onSubmit={handleAddReply}
                onCancel={() => setShowReplyEditor(false)}
                isNote={false}
                onFileUpload={handleFileUpload}
                onRemoveAttachment={removeAttachment}
              />
            </div>
          </div>
        )}

        {/* Note Editor */}
        {showNoteEditor && (
          <div className="flex justify-end">
            <div className="max-w-3xl w-full">
              <ReplyEditor
                form={replyForm}
                setForm={setReplyForm}
                onSubmit={handleAddNote}
                onCancel={() => setShowNoteEditor(false)}
                isNote={true}
                onFileUpload={handleFileUpload}
                onRemoveAttachment={removeAttachment}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center justify-center space-x-4">
          <Button 
            onClick={() => setShowReplyEditor(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Reply
          </Button>
          <Button 
            variant="secondary"
            onClick={() => setShowNoteEditor(true)}
          >
            <FileText className="w-4 h-4 mr-2" />
            Add Note
          </Button>
        </div>
      </div>
    </div>
  );
}

// Rich Text Reply Editor Component
function ReplyEditor({ form, setForm, onSubmit, onCancel, isNote, onFileUpload, onRemoveAttachment }) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [templates] = useState([]); // TODO: Implement templates

  const handleFormat = (format) => {
    // TODO: Implement rich text formatting
    console.log('Format:', format);
  };



  const handleTemplateApply = () => {
    // TODO: Implement template application
    console.log('Apply template');
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      {/* To Field */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">To:</label>
        <input
          type="text"
          value="Customer" // TODO: Get actual recipient
          readOnly
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
        />
      </div>

      {/* Rich Text Editor Toolbar */}
      <div className="border border-gray-300 rounded-t-md">
        <div className="bg-gray-50 border-b border-gray-300 p-2 flex items-center space-x-2 flex-wrap">
          {/* Text Style Dropdown */}
          <select className="text-sm border border-gray-300 rounded px-2 py-1">
            <option>Normal</option>
            <option>Heading 1</option>
            <option>Heading 2</option>
            <option>Heading 3</option>
          </select>

          {/* Formatting Buttons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => handleFormat('bold')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Bold"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFormat('italic')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Italic"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFormat('underline')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Underline"
            >
              <Underline className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFormat('strikethrough')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Strikethrough"
            >
              <Strikethrough className="w-4 h-4" />
            </button>
          </div>

          {/* List Buttons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => handleFormat('orderedList')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Numbered List"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFormat('unorderedList')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Bulleted List"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Alignment Buttons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => handleFormat('alignLeft')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Align Left"
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFormat('alignCenter')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Align Center"
            >
              <AlignCenter className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFormat('alignRight')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Align Right"
            >
              <AlignRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFormat('alignJustify')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Justify"
            >
              <AlignJustify className="w-4 h-4" />
            </button>
          </div>

          {/* Insert Buttons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => handleFormat('insertImage')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Insert Image"
            >
              <Image className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFormat('insertLink')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Insert Link"
            >
              <Link className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleFormat('insertVideo')}
              className="p-1 hover:bg-gray-200 rounded"
              title="Insert Video"
            >
              <Video className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Text Area */}
        <div className="relative">
          <textarea
            value={form.reply_text}
            onChange={(e) => setForm(prev => ({ ...prev, reply_text: e.target.value }))}
            placeholder={isNote ? "Add an internal note..." : "Type your reply..."}
            rows={6}
            className="w-full px-3 py-2 border-0 focus:outline-none resize-none"
          />
          {/* Emoji Picker Button */}
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="absolute bottom-2 right-2 p-1 hover:bg-gray-100 rounded"
            title="Insert Emoji"
          >
            <Smile className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Attachments Display */}
        {form.attachments.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Attachments ({form.attachments.length})</h4>
            <div className="space-y-2">
              {form.attachments.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                  <div className="flex items-center">
                    <FileText className="w-4 h-4 text-gray-500 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveAttachment(index)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="Remove attachment"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* File Upload and Templates */}
      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={onFileUpload}
          className="flex items-center text-sm text-blue-600 hover:text-blue-800"
        >
          <Paperclip className="w-4 h-4 mr-1" />
          Upload File
        </button>

        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500">Templates:</span>
          <div className="bg-gray-100 border border-gray-300 rounded px-2 py-1 text-sm text-gray-600">
            No template found
          </div>
          <button
            onClick={handleTemplateApply}
            className="flex items-center text-sm text-blue-600 hover:text-blue-800"
          >
            <Send className="w-4 h-4 mr-1" />
            Apply Template
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex items-center justify-end space-x-3">
        <button
          onClick={onCancel}
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          Cancel
        </button>
        <Button
          onClick={onSubmit}
          disabled={!form.reply_text.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Send className="w-4 h-4 mr-2" />
          Submit
        </Button>
      </div>
    </div>
  );
}
