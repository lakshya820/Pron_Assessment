import logo from '../mlogo.svg'
import React, { useEffect, useState, useRef } from 'react'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import Stack from 'react-bootstrap/Stack'
import Table from 'react-bootstrap/Table'
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk'
import '../Transcription.css'

const API_KEY = process.env.REACT_APP_COG_SERVICE_KEY
const API_LOCATION = process.env.REACT_APP_COG_SERVICE_LOCATION
const STT_URL = "https://azure.microsoft.com/en-us/products/cognitive-services/speech-to-text/"

const REFERENCE_TEXTS = [
  "This is the sample sentence for pronunciation assessment.",
  "The quick brown fox jumps over the lazy dog.",
  "Please call Stella, ask her to bring these things with her from the store."
]

let transcriptionRecognizer = null
let assessmentRecognizer = null
let currentPronunciationConfig = null

function Transcription() {
  const [recognisedText, setRecognisedText] = useState("")
  const [recognisingText, setRecognisingText] = useState("")
  const [isRecognising, setIsRecognising] = useState(false)
  const [assessmentScores, setAssessmentScores] = useState(null)
  const [currentTextIndex, setCurrentTextIndex] = useState(0)
  const [results, setResults] = useState([])
  const [isAssessmentComplete, setIsAssessmentComplete] = useState(false)
  const textRef = useRef()
  const audioStream = useRef(null)

  const getCurrentReferenceText = () => REFERENCE_TEXTS[currentTextIndex]

  const startRecognizers = async () => {
    try {
      if (transcriptionRecognizer && assessmentRecognizer) {
        console.log("Starting recognition for:", getCurrentReferenceText())
        await transcriptionRecognizer.startContinuousRecognitionAsync()
        await assessmentRecognizer.startContinuousRecognitionAsync()
        setIsRecognising(true)
      }
    } catch (error) {
      console.error("Error starting recognizers:", error)
    }
  }

  const clearTranscription = () => {
    setRecognisedText("");
    setRecognisingText("");
    setAssessmentScores(null);
  }

  const stopRecognizers = async () => {
    try {
      setIsRecognising(false)
      if (transcriptionRecognizer && assessmentRecognizer) {
        await transcriptionRecognizer.stopContinuousRecognitionAsync()
        await assessmentRecognizer.stopContinuousRecognitionAsync()
      }
    } catch (error) {
      console.error("Error stopping recognizers:", error)
    }
  }

  const updatePronunciationConfig = async (text) => {
    if (assessmentRecognizer) {
      console.log("Updating pronunciation config for:", text)
      currentPronunciationConfig = new speechsdk.PronunciationAssessmentConfig(
        text,
        speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        speechsdk.PronunciationAssessmentGranularity.Word,
        true
      )
      await currentPronunciationConfig.applyTo(assessmentRecognizer)
    }
  }

  const handleStopRecording = async () => {
    await stopRecognizers()
    
    if (recognisedText && assessmentScores) {
      const currentScores = {
        ...assessmentScores,
        errors: assessmentScores.errors.filter(error => {
          // Only keep errors relevant to the current text
          const currentWords = getCurrentReferenceText().toLowerCase().split(/\s+/)
          return currentWords.includes(error.word.toLowerCase())
        })
    }

    setResults(prev => [...prev, {
      referenceText: getCurrentReferenceText(),
      transcribedText: recognisedText.trim(),
      scores: currentScores
    }])
  }

    if (currentTextIndex < REFERENCE_TEXTS.length - 1) {
      const nextIndex = currentTextIndex + 1
      const nextText = REFERENCE_TEXTS[nextIndex]
      
      setCurrentTextIndex(nextIndex)
      setRecognisedText("")
      setAssessmentScores(null)
      setIsRecognising(false)

      setTimeout(async () => {
        if (audioStream.current) {
          console.log("Switching to new reference text:", nextText)
          await createRecognizers(audioStream.current, nextText)
        }
      }, 100)
    } else {
      setIsAssessmentComplete(true)
    }
  }

  const handleAbort = async () => {
    await stopRecognizers()
    if (recognisedText && assessmentScores) {
      setResults(prev => [...prev, {
        referenceText: getCurrentReferenceText(),
        transcribedText: recognisedText.trim(),
        scores: { ...assessmentScores }
      }])
    }
    setIsAssessmentComplete(true)
  }

  const toggleListener = () => {
    if (!isRecognising) {
      startRecognizers()
      setRecognisedText("")
      setAssessmentScores(null)
    } else {
      handleStopRecording()
    }
  }

  const openWindow = (url) => {
    const top = 200
    const left = 300
    const height = window.innerHeight-top
    const width = window.innerWidth-left

    window.open(
      url, 
      '_blank', 
      `location=yes,height=${height},width=${width},top=${top},left=${left},scrollbars=yes,status=yes`
    )
  }

  const createRecognizers = async (stream, referenceText = null) => {
    try {
      if (transcriptionRecognizer) {
        await transcriptionRecognizer.close()
      }
      if (assessmentRecognizer) {
        await assessmentRecognizer.close()
      }

      const audioConfig = speechsdk.AudioConfig.fromStreamInput(stream)
      const currentText = referenceText || REFERENCE_TEXTS[currentTextIndex]

      console.log("Creating recognizers for reference text:", currentText)  // Debug log

      const transcriptConfig = speechsdk.SpeechConfig.fromSubscription(API_KEY, API_LOCATION)
      transcriptConfig.speechRecognitionLanguage = "en-US"

      const assessConfig = speechsdk.SpeechConfig.fromSubscription(API_KEY, API_LOCATION)
      assessConfig.speechRecognitionLanguage = "en-US"

      transcriptionRecognizer = new speechsdk.SpeechRecognizer(transcriptConfig, audioConfig)
      assessmentRecognizer = new speechsdk.SpeechRecognizer(assessConfig, audioConfig)

      currentPronunciationConfig = new speechsdk.PronunciationAssessmentConfig(
        currentText,
        speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        speechsdk.PronunciationAssessmentGranularity.Word,
        true
      )
      await currentPronunciationConfig.applyTo(assessmentRecognizer)

      console.log("Created assessment config for:", currentText)

      transcriptionRecognizer.recognizing = (s, e) => {
        setRecognisingText(e.result.text)
        if (textRef.current) {
          textRef.current.scrollTop = textRef.current.scrollHeight
        }
      }

      transcriptionRecognizer.recognized = (s, e) => {
        setRecognisingText("")
        if (e.result.reason === speechsdk.ResultReason.RecognizedSpeech) {
          setRecognisedText(prev => prev === '' ? e.result.text : `${prev} ${e.result.text}`)
          if (textRef.current) {
            textRef.current.scrollTop = textRef.current.scrollHeight
          }
        }
      }

      assessmentRecognizer.recognized = (s, e) => {
        if (e.result.reason === speechsdk.ResultReason.RecognizedSpeech) {
          try {
            const pronunciationResult = speechsdk.PronunciationAssessmentResult.fromResult(e.result)
            console.log("Full pronunciation result:", pronunciationResult)

            // Get reference and spoken words, normalized for comparison
            const referenceWords = currentText.toLowerCase().split(/\s+/)
            const spokenWords = e.result.text.toLowerCase().split(/\s+/)

            let errors = []

            // Add mispronunciation errors from the assessment
            if (pronunciationResult.detailResult && pronunciationResult.detailResult.Words) {
              const mispronunciationErrors = pronunciationResult.detailResult.Words
                .filter(word => word && word.Word)
                .map(word => ({
                  word: word.Word,
                  errorType: word.PronunciationAssessment?.ErrorType || 'None',
                  accuracy: word.PronunciationAssessment?.AccuracyScore || 0
                }))
                .filter(error => error.errorType !== 'None' || error.accuracy < 80)

              errors.push(...mispronunciationErrors)
            }

            // Add omitted words
            referenceWords.forEach(word => {
              if (!spokenWords.includes(word)) {
                errors.push({
                  word: word,
                  errorType: "Omission",
                  accuracy: 0
                })
              }
            })

            console.log("Current reference text:", currentText)
            console.log("Spoken words:", spokenWords)
            console.log("Detected errors:", errors)      
            console.log("Detected errors:", errors)

            const scores = {
              accuracyScore: pronunciationResult.accuracyScore,
              fluencyScore: pronunciationResult.fluencyScore,
              completenessScore: pronunciationResult.completenessScore,
              pronunciationScore: pronunciationResult.pronunciationScore,
              prosodyScore: pronunciationResult.prosodyScore || null,
              errors: errors
            }

            console.log("Setting assessment scores:", scores)
            setAssessmentScores(scores)
          } catch (error) {
            console.error("Error processing pronunciation result:", error)
          }
        }
      }

      const handleError = (recognizer, e) => {
        console.error(`Recognition canceled:`, {
          reason: e.reason,
          errorCode: e.errorCode,
          errorDetails: e.errorDetails
        })
        recognizer.stopContinuousRecognitionAsync()
      }

      transcriptionRecognizer.canceled = (s, e) => handleError(transcriptionRecognizer, e)
      assessmentRecognizer.canceled = (s, e) => handleError(assessmentRecognizer, e)

      console.log("Successfully created recognizers")
    } catch (error) {
      console.error("Error creating recognizers:", error)
      throw error
    }
  }

  useEffect(() => {
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            sampleSize: 16,
            volume: 1
          }
        })
        audioStream.current = stream
        await createRecognizers(stream)
      } catch (err) {
        console.error("Error accessing media devices:", err)
        alert("Error accessing microphone: " + err.message)
      }
    }

    getMedia()

    return () => {
      const cleanup = async () => {
        try {
          if (transcriptionRecognizer) {
            await transcriptionRecognizer.close()
          }
          if (assessmentRecognizer) {
            await assessmentRecognizer.close()
          }
        } catch (error) {
          console.error("Error during cleanup:", error)
        }
      }
      cleanup()
    }
  }, [])

  // ... (rest of the component code remains the same, including the return statement)

  // Return statement (same as before)
  return (
    <div className="app-container">
      {/* <img src={logo} className={`app-logo ${isRecognising ? 'app-logo-rotate' : ''}`} alt="Microsoft Logo" /> */}
      
      {!isAssessmentComplete ? (
        <div className="assessment-container">
          <div className="textarea-container">
            <div className="question-text">Reference Text ({currentTextIndex + 1} of {REFERENCE_TEXTS.length})</div>
            <Form.Control
              as="textarea"
              value={getCurrentReferenceText()}
              readOnly
              className="reference-textarea"
            />
            
            <div className="question-text mt-4">Your Speech</div>
            <Form.Control
              as="textarea"
              placeholder="The transcription will go here"
              value={`${recognisedText}${recognisingText}`}
              readOnly
              className="speech-textarea"
              ref={textRef}
            />
            
            <p className="instructions-text">
              Important Instructions: Please take 30-40 seconds to frame your answer and then try answering in one go without any unnecessary pauses.
            </p>

            <div className="button-container">
              <Button 
                variant={isRecognising ? "secondary" : "primary"}
                onClick={toggleListener}
                className="action-button">
                {isRecognising ? 'Stop' : 'Start'}
              </Button>
              <Button 
                variant="secondary" 
                onClick={clearTranscription}
                className="action-button">
                Clear
              </Button>
              {/* <Button 
                variant="secondary" 
                onClick={removeLastSentence}
                className="action-button">
                Remove last sentence
              </Button> */}
              <Button 
                variant="warning" 
                onClick={handleAbort}
                className="action-button">
                Abort Assessment
              </Button>
            </div>

            <div className="note-text">
              Using Microsoft <a href="#" onClick={() => openWindow(STT_URL)} className="link-text">
                Azure Speech to Text
              </a> for Real Time Transcription and Pronunciation Assessment
            </div>
          </div>
        </div>
      ) : (
        <div className="results-container">
          <h4 className="results-title">Assessment Results</h4>
          <Table striped bordered hover variant="dark">
            <thead>
              <tr>
                <th>Reference Text</th>
                <th>Your Speech</th>
                <th>Scores</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, index) => (
                <tr key={index}>
                  <td>{result.referenceText}</td>
                  <td>{result.transcribedText}</td>
                  <td>
                    <div className="scores-container">
                      <p className="score-item">Accuracy: {result.scores?.accuracyScore.toFixed(2)}</p>
                      <p className="score-item">Fluency: {result.scores?.fluencyScore.toFixed(2)}</p>
                      <p className="score-item">Completeness: {result.scores?.completenessScore.toFixed(2)}</p>
                      <p className="score-item">Pronunciation: {result.scores?.pronunciationScore.toFixed(2)}</p>

                      {result.scores?.errors?.length > 0 ? (
                        <div className="errors-container">
                          <p className="errors-title">Pronunciation Errors Found:</p>
                          <ul className="errors-list">
                            {result.scores.errors.map((error, idx) => (
                              <li key={idx} className={`error-item ${error.errorType.toLowerCase()}`}>
                                Word: "{error.word}" - Type: {error.errorType}
                                {error.accuracy !== undefined && error.errorType !== "Omission" && 
                                  ` (Accuracy: ${error.accuracy.toFixed(2)})`
                                }
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="no-errors">No pronunciation errors detected</p>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  )
}

export default Transcription