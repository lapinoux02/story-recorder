<template>
<div class="app">
  <div class="header">
    Story Recorder
    <div class="button neutral shadow" @click="reset"><i class="material-icons">history</i> Nouveau livre</div>
    <input class="book-name" type="text" placeholder="Nom_du_livre" :value="bookName" @input="saveBookName($event.target.value)" />
  </div>
  <div class="nav">
    <div class="nav-button" @click="previousPage"  :class="{ 'disabled': pageIndex === 0 }"><div class="material-icons">chevron_left</div></div>
    Page {{ pageIndex + 1 }}
    <div class="nav-button" @click="nextPage" :class="{ 'disabled': !this.currentBlob }"><div class="material-icons">chevron_right</div></div>
  </div>
  <div class="content">
    <div class="widget shadow">
      <div>
        <div class="button neutral shadow" @click="toggleRecording"><div class="material-icons">mic</div>{{ isRecording ? 'Arréter' : 'Enregistrer' }}</div>
      </div>
      <div>
        <div class="button neutral shadow" :class="{ 'disabled': !this.currentBlob }" @click="replayRecording"><div class="material-icons">replay</div>Rejouer</div>
      </div>
    </div>
  </div>
  <div class="footer"><div class="button dark shadow" @click="downloadAll"><div class="material-icons">download</div>Télécharger</div></div>
</div>
</template>

<script>
import JSZip from 'jszip'

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("db", 1)

    request.onupgradeneeded = () => {
      request.result.createObjectStore("audioPages")
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export default {
  data() {
    return {
      isRecording: false,
      mediaRecorder: null,
      audioChunks: [],

      bookName: localStorage.getItem('bookName') || '',

      pages: [{}],
      pageIndex: 0
    }
  },
  created() {
    navigator.mediaDevices.getUserMedia({audio: true}).then((stream) => this.mediaRecorder = new MediaRecorder(stream))
    this.loadPagesAudio()
  },
  computed: {
    currentPage() {
      return this.pages[this.pageIndex]
    },
    currentBlob() {
      return this.currentPage?.audio
    },
    currentAudio() {
      return this.currentBlob ? new Audio(URL.createObjectURL(this.currentBlob)) : null
    }
  },
  methods: {
    saveBookName(name) {
      this.bookName = name
      localStorage.setItem('bookName', name)
    },
    reset() {
      this.pages = [{}]
      this.bookName = ''
      this.pageIndex = 0
      if (this.isRecording) {
        this.cancelRecording()
      }
      this.deleteAllAudio()
      localStorage.removeItem('bookName')
    },
    toggleRecording() {
      if (this.isRecording) {
        this.stopRecording()
      } else {
        this.startRecording()
      }
    },
    startRecording() {
      this.isRecording = true
      this.audioChunks = []
      this.mediaRecorder.start()
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }
      this.mediaRecorder.onstop = () => {
        this.currentPage.audio = new Blob(this.audioChunks, {type: 'audio/wav'})
        this.savePageAudio()
      }
    },
    stopRecording() {
      this.isRecording = false
      this.mediaRecorder.stop()
    },
    cancelRecording() {
      this.isRecording = false
      this.mediaRecorder.stop()
      this.audioChunks = []
      this.currentPage.audio = null
      this.deletePageAudio()
    },
    replayRecording() {
      if (this.currentAudio) {
        this.currentAudio.play()
      }
    },
    nextPage() {
      this.pageIndex++
      if (this.isRecording) {
        this.cancelRecording()
      }
      if (this.pageIndex >= this.pages.length) {
        this.pages.push({})
      }
    },
    previousPage() {
      if (this.pageIndex > 0) {
        this.pageIndex--
        if (this.isRecording) {
          this.cancelRecording()
        }
      }
    },
    async downloadAll() {
      const zip = new JSZip()

      this.pages.forEach((page, index) => zip.file(`${String(index + 1).padStart(6, '0')}.wav`, page.audio))

      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const link = document.createElement('a')

      link.href = url
      link.download = `${this.bookName || 'recordings'}.zip`
      link.click()
    },

    async savePageAudio() {
      const db = await openDB()

      return new Promise((resolve, reject) => {
        const tx = db.transaction("audioPages", "readwrite")
        tx.objectStore("audioPages").put(this.currentPage.audio, this.pageIndex)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      })
    },
    async loadPagesAudio() {
      const db = await openDB()

      return new Promise((resolve, reject) => {
        const tx = db.transaction("audioPages", "readonly")
        const store = tx.objectStore("audioPages")
        const request = store.getAll()

        request.onsuccess = () => {
          this.pages = request.result.map(audio => ({ audio }))
          if (this.pages.length === 0) {
            this.pages.push({})
          }
          db.close()
          resolve()
        }

        request.onerror = () => {
          db.close()
          reject(request.error)
        }
      })
    },
    async deletePageAudio() {
      const db = await openDB()

      return new Promise((resolve, reject) => {
        const tx = db.transaction("audioPages", "readwrite")
        tx.objectStore("audioPages").delete(this.pageIndex)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      })
    },
    async deleteAllAudio() {
      const db = await openDB()

      return new Promise((resolve, reject) => {
        const tx = db.transaction("audioPages", "readwrite")
        tx.objectStore("audioPages").clear()
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      })
    }
  }
}
</script>

<style>
.app {
  --dark: #374148;
  --light: #f8f2e2;
  --accent: #e7d3ad;
  --white: #fdfef9;
  --border: #ccc;
  height: 100dvh;
  width: 100dvw;
  background: var(--light);
  display: flex;
  flex-direction: column;
  justify-content: stretch;
  color: var(--dark);
  font-family: 'Inter', sans-serif;
  font-size: 20px;
  .header {
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    font-size: 30px;
    padding: 10px;
    .book-name {
      padding: 10px;
      font-size: 20px;
      border-radius: 8px;
      border: 2px solid var(--dark);
      width: 80%;
      background: var(--light);
    }
  }
  .footer {
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 10px 0;
    .button {
      width: 80%;
      padding: 15px;
      font-size: 20px;
    }
  }
  .nav {
    height: 60px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 50px;
    .nav-button {
      height: 40px;
      width: 40px;
      border-radius: 8px;
      background: var(--dark);
      color: var(--white);
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      &.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
      .material-icons {
        font-size: 30px;
      }
    }
  }
  .content {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    .widget {
      padding: 20px;
      border-radius: 20px;
      background: var(--white);
      display: flex;
      justify-content: stretch;
      width: 80%;
      > :first-child {
        border-right: 1px solid var(--border);
        padding-right: 20px;
      }
      > :last-child {
        padding-left: 20px;
      }
      > * {
        flex: 1 0 0;
        display: flex;
        justify-content: center;
        align-items: center;
      }
    }
  }
  .button {
    padding: 10px 15px;
    border-radius: 5000px;
    cursor: pointer;
    font-weight: 500;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    &.neutral {
      background: var(--accent);
    }
    &.dark {
      background: var(--dark);
      color: var(--white);
    }
    &.disabled {
      opacity: 0.5;
      pointer-events: none;
    }
  }
  .shadow {
    box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.2);
  }
}
</style>