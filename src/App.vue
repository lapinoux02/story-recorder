<template>
<div class="app">
  <div class="header">
    Story Recorder
    <div class="button neutral shadow" @click="reset"><i class="material-icons">history</i> Nouveau livre</div>
    <input class="book-name" type="text" placeholder="Nom_du_livre" :value="bookName" @input="saveBookName($event.target.value)" />
  </div>
  <div class="nav">
    <div class="nav-button" @click="previousPage"  :class="{ 'disabled': pageIndex === 0 }"><div class="material-icons">chevron_left</div></div>
    <template v-if="pageIndex">Page {{ pageIndex }}</template>
    <template v-else>Titre</template>
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
      <div class="small-pill shadow" v-if="currentDuration">{{ currentDuration.toFixed(2) + 's' }}</div>
    </div>
  </div>
  <div class="footer"><div class="button dark shadow" @click="downloadAll"><div class="material-icons">download</div>Télécharger</div></div>
</div>
</template>

<script>
import JSZip from 'jszip'
import lamejsBundleUrl from 'lamejs/lame.all.js?url'

let mp3EncoderPromise

function loadMp3Encoder() {
  if (window.lamejs?.Mp3Encoder) {
    return Promise.resolve(window.lamejs.Mp3Encoder)
  }

  if (!mp3EncoderPromise) {
    mp3EncoderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = lamejsBundleUrl
      script.onload = () => {
        if (window.lamejs?.Mp3Encoder) {
          resolve(window.lamejs.Mp3Encoder)
        } else {
          mp3EncoderPromise = null
          reject(new Error('lamejs loaded without an MP3 encoder'))
        }
      }
      script.onerror = () => {
        mp3EncoderPromise = null
        reject(new Error('Failed to load lamejs'))
      }
      document.head.appendChild(script)
    })
  }

  return mp3EncoderPromise
}

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

      currentAudioUrl: null,
      currentAudio: null,
      currentDuration: null,

      bookName: localStorage.getItem('bookName') || '',

      pages: [{}],
      pageIndex: 0
    }
  },
  created() {
    navigator.mediaDevices.getUserMedia({audio: true}).then((stream) => this.mediaRecorder = new MediaRecorder(stream))
    this.loadPagesAudio()
  },
  watch: {
    currentBlob() {
      this.setCurrentAudio()
    }
  },
  computed: {
    currentPage() {
      return this.pages[this.pageIndex]
    },
    currentBlob() {
      return this.currentPage?.audio
    }
  },
  methods: {
    setCurrentAudio() {
      if (this.currentBlob) {
        URL.revokeObjectURL(this.currentAudioUrl)
        this.currentAudioUrl = URL.createObjectURL(this.currentBlob)
        this.currentAudio = new Audio(this.currentAudioUrl)
        this.currentAudio.addEventListener('loadedmetadata', () => this.currentDuration = this.currentAudio.duration)
      } else {
        this.currentAudio = null
        this.currentAudioUrl = null
        this.currentDuration = null
      }
    },
    saveBookName(name) {
      this.bookName = name
      localStorage.setItem('bookName', name)
    },
    reset() {
      this.pages = [{}]
      this.bookName = ''
      this.pageIndex = 0
      this.currentAudioUrl = null
      this.currentAudio = null
      this.currentDuration = null
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
        this.currentPage.audio = new Blob(this.audioChunks, {type: this.mediaRecorder.mimeType})
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

      for (const [index, page] of this.pages.entries()) {
        if (page.audio) {
          zip.file(`${String(index).padStart(3, '0')}.mp3`, await this.convertToMp3(page.audio))
        }
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const link = document.createElement('a')

      link.href = url
      link.download = `${this.bookName || 'recordings'}.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    async convertToMp3(blob) {
      const audioContext = new AudioContext({ sampleRate: 44100 })

      try {
        const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer())
        const channels = Math.min(audioBuffer.numberOfChannels, 2)
        const Mp3Encoder = await loadMp3Encoder()
        const encoder = new Mp3Encoder(channels, audioBuffer.sampleRate, 128)
        const left = this.toInt16Samples(audioBuffer.getChannelData(0))
        const right = channels === 2 ? this.toInt16Samples(audioBuffer.getChannelData(1)) : null
        const mp3Chunks = []

        for (let offset = 0; offset < left.length; offset += 1152) {
          const leftChunk = left.subarray(offset, offset + 1152)
          const encoded = channels === 2
            ? encoder.encodeBuffer(leftChunk, right.subarray(offset, offset + 1152))
            : encoder.encodeBuffer(leftChunk)

          if (encoded.length > 0) {
            mp3Chunks.push(encoded)
          }
        }

        const finalChunk = encoder.flush()
        if (finalChunk.length > 0) {
          mp3Chunks.push(finalChunk)
        }

        return new Blob(mp3Chunks, { type: 'audio/mpeg' })
      } finally {
        await audioContext.close()
      }
    },
    toInt16Samples(samples) {
      const int16Samples = new Int16Array(samples.length)

      for (let index = 0; index < samples.length; index++) {
        const sample = Math.max(-1, Math.min(1, samples[index]))
        int16Samples[index] = Math.round(sample < 0 ? sample * 32768 : sample * 32767)
      }

      return int16Samples
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
      position: relative;
      padding: 20px;
      border-radius: 20px;
      background: var(--white);
      display: flex;
      justify-content: stretch;
      width: 80%;
      > :first-child {
        border-right: 1px solid var(--border);
      }
      > * {
        flex: 1 0 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 10px;
      }
      .small-pill {
        position: absolute;
        bottom: -15px;
        padding: 5px 10px;
        border-radius: 5000px;
        background: var(--dark);
        color: var(--white);
        font-size: 14px;
        left: 50%;
        transform: translateX(-50%);
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