import { Controller } from '@hotwired/stimulus';
import { post, get } from '@rails/request.js';
import { debounce } from 'lodash';
import UAParser from 'ua-parser-js';
import { FetchRequest } from '@rails/request.js';

import { DirectUpload } from '@rails/activestorage/src/direct_upload';

const GIPHY_TREDING_ENDPOINT = 'https://api.giphy.com/v1/gifs/trending';
const GIPHY_ENDPOINT = 'https://api.giphy.com/v1/gifs/search';
const API_KEY = '97g39PuUZ6Q49VdTRBvMYXRoKZYd1ScZ'; // Replace with your Giphy API key

const normalize = (val, max, min) => {
  return (val - min) / (max - min);
};

const percentage = (partialValue, totalValue) => {
  return (100 * partialValue) / totalValue;
};

export default class extends Controller {
  static targets = [
    'header',
    'chatField',
    'uploadField',
    'conversationScrollArea',
    'emojiPicker',
    'giphyList',
    'giphyWrapper',
    'giphySearchInput',
    'conversationPart',
    'conversation',
    'animated',
    'loader',
  ];

  static values = {
    url: { type: String },
    open: { type: Boolean, default: true },
    isMobile: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
  };

  initialize() {
    // Bind the debounced version to the instance
    this.debouncedHandleGiphySeach = debounce(
      this.handleGiphySeach.bind(this),
      300
    );

    this.conversationKey = null;

    this.open = true;
    this.prevent = true;

    this.eventsHandler = function (event) {
      console.log('Received custom event with data:', event.detail.data);
      const data = JSON.parse(event.detail.data);

      switch (data.type) {
        case 'triggers:receive':
          this.pushEvent('request_trigger', {
            conversation: this.currentConversationKey(), //this.state.conversation && this.state.conversation.key,
            trigger: data.data.trigger.id,
          });
          break;
        case 'conversations:unreads':
          const message = {
            type: 'chaskiq:event',
            data: data,
          };

          // console.log("SENDING EVENT TP PARENT FRAME", message)
          window.parent.postMessage(message, '*');

          if (this.openValue) {
            console.log('React on open with', data);
          } else {
            console.log('React on closed', data);
            this.openValue = true;
            this.handleReceivedNewMessageFromClosed(data.data);
          }

          break;

        default:
          break;
      }
    };

    document.addEventListener('ChaskiqEvent', this.eventsHandler.bind(this));
    window.addEventListener('message', this.iframeEventsReceiver.bind(this));

    this.streamListener();
    this.startObservingConversationTarget();

    /*document.addEventListener("turbo:before-fetch-request", async (event) => {
      event.preventDefault()
      console.log("animating")
      await this.animateAll()
      console.log("animated!")
      event.detail.resume()
    })*/
  }

  connect() {
    window.oli = this;
    window.pupu = document.getElementById('main-content');
    console.log('MESSENGER INITIALIZED');
  }

  handleReceivedNewMessageFromClosed(data) {
    this.goTo(
      `${this.element.dataset.url}/conversations/${data.conversation_key}`,
      () => {
        this.toggle();
      }
    );
  }

  toggle() {
    const message = {
      type: 'chaskiq:event',
      data: {
        type: 'messenger:toggle',
        data: {},
      },
    };

    window.parent.postMessage(message, '*');
  }

  openValueChanged() {
    console.log('FRAME TOGGLED', this.openValue);
  }

  currentConversationKey() {
    if (this.hasConversationTarget) {
      return this.conversationTarget.dataset.conversationKey;
    } else {
      return null;
    }
  }

  iframeEventsReceiver(event) {
    switch (event.data.eventType) {
      case 'messenger:toggled':
        this.openValue = event.data.data;
        break;
      case 'messenger:mobile':
        this.isMobileValue = event.data.data;
        break;
      default:
        break;
    }
    // Check the origin of the data!
    //if (event.origin !== "http://example.com") { // replace with the parent's origin
    //    return;
    //}
    // console.log('Received message from parent:', event.data);
  }

  streamListener() {
    const element = document.querySelector(
      '#chaskiq-streams turbo-cable-stream-source'
    );

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'connected'
        ) {
          if (element.hasAttribute('connected')) {
            console.log('Element is connected');
            // Trigger your function here
            this.registerVisit();
          } else {
            console.log('Element is disconnected');
          }
        }
      });
    });

    observer.observe(element, {
      attributes: true,
    });
  }

  registerVisit() {
    const parser = new UAParser();

    const results = parser.getResult();

    const data = {
      title: document.title,
      url: document.location.href,
      browser_version: results.browser.version,
      browser_name: results.browser.name,
      os_version: results.os.version,
      os: results.os.name,
    };
    console.log('PUSH EVENT HERE', data);
    this.pushEvent('send_message', { browser_data: data });
    // this.App.events.perform('send_message', data);
  }

  async pushEvent(eventType, data) {
    const url = `${this.element.dataset.url}/events?event=${eventType}`;

    const request = new FetchRequest('post', url, {
      body: JSON.stringify(data),
    });
    const response = await request.perform();
    if (response.ok) {
      console.log('send message ok');
    } else {
      console.error('error sending message');
    }
  }

  conversationTargetAppeared() {
    this.scrollToBottom();
  }

  startObservingConversationTarget() {
    const observer = new MutationObserver((mutationsList, observer) => {
      for (let mutation of mutationsList) {
        if (mutation.type === 'childList') {
          if (this.hasConversationTarget) {
            // trigger this only if conversation key is not set or is changed
            if (
              !this.conversationKey ||
              this.conversationKey !== this.conversationTarget.id
            ) {
              this.conversationKey = this.conversationTarget.id;
              this.conversationTargetAppeared();
            }
          } else {
            this.picker = null;
            // this.emojiPickerTarget.innerHTML = ""
            console.log('TARGET GONEEE!!!');
          }
        }
      }
    });

    // Observe the parent element for changes to its child elements
    const config = { childList: true, subtree: true };
    observer.observe(this.element, config);
  }

  submitMessage() {
    this.scrollToBottom();
  }

  convertToSerializedContent(value) {
    return {
      text: value,
    };
  }

  disconnect() {
    document.removeEventListener('ChaskiqEvent', this.eventsHandler);
    window.removeEventListener('resize', this.updateDimensions);
    window.removeEventListener('message', this.iframeEventsReceiver);
  }

  async insertComment(url, data, callbacks) {
    callbacks.before && callbacks.before();

    const response = await post(url, {
      body: data,
      responseKind: 'turbo-stream',
    });

    this.chatFieldTarget.value = '';

    if (response.ok) {
      callbacks && callbacks.sent();
      //const body = await response.html
      //this.element.closest('.definition-renderer').outerHTML = body
      console.log('response!');
    }
  }

  async goTo(url, cb) {
    const response = await get(url, {
      responseKind: 'turbo-stream',
    });

    if (response.ok) {
      cb && cb(response);
      console.log('Navigated to: ', url);
    }
  }

  getPartWrapperController(id) {
    return this.application.getControllerForElementAndIdentifier(
      document.getElementById(id),
      'conversation-part-wrapper'
    );
  }

  handleEnter(e) {
    console.log('HANDLE ENTER');

    e.preventDefault();

    if (this.chatFieldTarget.value === '') return;

    const opts = {
      content: this.chatFieldTarget.value,
      //...this.convertToSerializedContent(this.chatFieldTarget.value),
    };

    console.log(this.chatFieldTarget.dataset.url, opts);

    const lastMessage = this.conversationPartTargets[0];

    this.insertComment(this.chatFieldTarget.dataset.url, opts);

    if (lastMessage && lastMessage.dataset.blockKind === 'wait_for_reply') {
      console.log('REPLY THIS ON WAIT!');
      this.getPartWrapperController(lastMessage.id).sendEvent(
        {},
        { force: true }
      );
    }

    /*
    this.props.insertComment(opts, {
      before: () => {
        this.props.beforeSubmit && this.props.beforeSubmit(opts);
        this.chatFieldTarget.value = '';
      },
      sent: () => {
        this.props.onSent && this.props.onSent(opts);
        this.chatFieldTarget.value = '';
      },
    });*/
  }

  handleChatInput(e) {
    console.log('HANDLE typing');
    console.log(e.type);
  }

  setHeaderStyles(element, styles) {
    for (let [property, value] of Object.entries(styles)) {
      if (property === 'translateY') {
        // Handle transform properties separately
        element.style.transform = `translateY(${value})`;
      } else {
        element.style[property] = value;
      }
    }
  }

  handleScroll(e) {
    if (this.hasHeaderTarget) {
      const target = e.target;
      const opacity =
        1 - normalize(target.scrollTop, target.offsetHeight * 0.26, 0);
      const pge = percentage(target.scrollTop, target.offsetHeight * 0.7);
      // console.log("AAAA", val)
      const options = {
        translateY: -pge - 8,
        opacity: opacity,
        height: this.headerTarget.offsetHeight,
      };
      this.setHeaderStyles(this.headerTarget, options);
    }
  }

  handleFileUpload(e) {
    console.log('CLICK', e);
    // Trigger the hidden file input
    this.uploadFieldTarget.click();
  }

  handleFileUploadChange(e) {
    console.log(e);
    const file = e.target.files[0];
    if (file) {
      // Handle the file, e.g., send to server or process locally
      console.log('Selected file:', file.name);
    }
    this.handleUpload(e);
  }

  scrollToBottom() {
    const overflow = this.conversationScrollAreaTarget;
    overflow.scrollTop = overflow.scrollHeight;
  }

  async animateOnClick(e) {
    e.preventDefault();
    await this.animateAll();
    await this.goTo(e.target.href);
  }

  async animateAll() {
    this.animatedTargets.forEach((element) => {
      const inClass = element.getAttribute('data-in');
      const outClass = element.getAttribute('data-out');

      if (element.classList.contains(inClass)) {
        element.classList.remove(inClass);
        element.classList.add(outClass);
      } else {
        element.classList.remove(outClass);
        element.classList.add(inClass);
      }
    });

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 200);
    });
  }

  hideEmojiContainer() {
    this.emojiPickerTarget.classList.add('hidden');
  }

  showEmojiContainer(e) {
    e.stopPropagation();
    this.emojiPickerTarget.classList.toggle('hidden');
  }

  // https://stackoverflow.com/questions/11076975/insert-text-into-textarea-at-cursor-position-javascript
  insertAtCursor(myValue) {
    const myField = this.chatFieldTarget;
    // IE support
    if (document.selection) {
      myField.focus();
      const sel = document.selection.createRange();
      sel.text = myValue;
    } else if (myField.selectionStart || myField.selectionStart === '0') {
      // MOZILLA and others
      const startPos = myField.selectionStart;
      const endPos = myField.selectionEnd;
      myField.value =
        myField.value.substring(0, startPos) +
        myValue +
        myField.value.substring(endPos, myField.value.length);
    } else {
      myField.value += myValue;
    }
  }

  hideGiphyContainer() {
    this.giphyWrapperTarget.classList.add('hidden');
  }

  async showGiphyContainer(e) {
    e.stopPropagation();
    this.giphyWrapperTarget.classList.toggle('hidden');
    if (!this.giphyWrapperTarget.classList.contains('hidden')) {
      const gifs = await this.fetchDefaultGifs();
      this.displayGifs(gifs);
    }
  }

  // Call this function on input change instead
  async debouncedGiphySearch(e) {
    await this.debouncedHandleGiphySeach(e);
  }

  async handleGiphySeach(e) {
    const gifs = await this.fetchGifs(e.target.value);
    this.displayGifs(gifs);
  }

  async fetchGifs(term) {
    const response = await fetch(
      `${GIPHY_ENDPOINT}?api_key=${API_KEY}&limit=10&q=${term}`
    );
    const data = await response.json();
    this.giphyListTarget.innerHTML = '';
    return data.data;
  }

  async fetchDefaultGifs() {
    const response = await fetch(
      `${GIPHY_TREDING_ENDPOINT}?api_key=${API_KEY}&limit=10`
    );
    const data = await response.json();
    return data.data;
  }

  pickGiphyImage(e) {
    console.log(e.target.src);
    this.hideGiphyContainer();
    this.saveGif(e.target.src);
  }

  saveGif(src) {
    this.submitImage(src, () => {
      this.setState({ giphyEnabled: false });
    });
  }

  displayGifs(gifs) {
    const container = this.giphyListTarget;
    gifs.forEach((gif) => {
      const gifElement = document.createElement('img');
      gifElement.src = gif.images.fixed_height.url;
      gifElement.setAttribute('data-action', 'click->messenger#pickGiphyImage');
      container.appendChild(gifElement);
    });
  }

  getImageDimensions(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = function () {
        const width = this.naturalWidth;
        const height = this.naturalHeight;
        resolve({ width, height });
      };

      img.onerror = function () {
        reject(new Error('Failed to load image.'));
      };

      img.src = url;
    });
  }

  submitImage(link, cb = null) {
    this.getImageDimensions(link)
      .then((dimensions) => {
        // const html = `<img src="${link}" width="${dimensions.width}" height="${dimensions.height}" url="${link}" data-type="image"/>`;

        const serialized = {
          type: 'doc',
          content: [
            {
              type: 'ImageBlock',
              attrs: {
                url: link,
                src: link,
                width: dimensions.width,
                height: dimensions.height,
                loading: false,
                loading_progress: 0,
                caption: null,
                direction: 'center',
                file: null,
                aspect_ratio: { width: 200, height: 200, ratio: 100 },
              },
            },
          ],
        };

        const opts = {
          serialized: serialized,
        };

        this.insertComment(this.chatFieldTarget.dataset.url, opts, {
          before: () => {
            this.beforeUpload(opts);
            //this.props.beforeSubmit && this.props.beforeSubmit(opts);
            // this.input.value = '';
          },
          sent: () => {
            this.afterUpload(opts);
            //this.props.onSent && this.props.onSent(opts);
            //this.input.value = '';
            cb && cb();
          },
        });

        console.log(
          `Image width: ${dimensions.width}, Image height: ${dimensions.height}`
        );
      })
      .catch((error) => {
        console.error(`Error: ${error.message}`);
      });
  }

  imageUpload(file, props = null) {
    return new Promise((resolve) => {
      if (props) {
        props.onLoading();
        // props.change(previewField, '/spinner.gif')
      }

      const upload = new DirectUpload(file, `/api/v1/direct_uploads`);

      upload.create((error, blob) => {
        if (error) {
          alert('error uploading!');
          props && props.onError(error);
        } else {
          if (props) {
            props.onSuccess({
              link: blob.service_url,
              filename: blob.filename,
              content_type: blob.content_type,
            });
          }
          resolve({ data: { ...blob, link: blob.service_url } });
        }
      });
    });
  }

  handleUpload(ev) {
    this.imageUpload(ev.target.files[0], {
      //domain: this.props.domain,
      onLoading: () => {
        this.setLock(true);
      },
      onError: (err) => {
        alert('error uploading');
        console.log(err);
      },
      onSuccess: (attrs) => {
        if (attrs.content_type.match(/image\/(jpg|png|jpeg|gif)/)) {
          this.submitImage(attrs.link);
        } else {
          this.submitFile(attrs);
        }
        this.setLock(false);
      },
    });
  }

  setLock(val) {
    console.log('TODO: set lock!', val);
  }

  beforeUpload(opts) {
    this.loaderTarget.classList.remove('hidden');
  }

  afterUpload(opts) {
    this.loaderTarget.classList.add('hidden');
  }

  submitFile(attrs, cb = null) {
    //const html = `<file-block src="${attrs.link}" url="${attrs.link}" data-filename="${attrs.filename}" data-type="file" data-content-type="${attrs.content_type}"/>`;
    const serialized = {
      type: 'doc',
      content: [
        {
          type: 'FileBlock',
          attrs: {
            url: attrs.link,
            src: attrs.link,
            width: '',
            height: '',
            loading: false,
            loading_progress: 0,
            caption: null,
            direction: 'center',
            file: null,
            aspect_ratio: { width: 200, height: 200, ratio: 100 },
          },
        },
      ],
    };

    const opts = {
      serialized: serialized,
      //...this.convertToSerializedContent(html),
    };

    this.insertComment(this.chatFieldTarget.dataset.url, opts, {
      before: () => {
        this.beforeUpload(opts);
        //this.props.beforeSubmit && this.props.beforeSubmit(opts);
        // this.input.value = '';
      },
      sent: () => {
        this.afterUpload(opts);
        //this.props.onSent && this.props.onSent(opts);
        //this.input.value = '';
        cb && cb();
      },
    });
  }

  async handleStepControlClick(e) {
    const data = {
      reply: e.target.dataset.step,
      trigger_id: e.target.dataset.triggerId,
      step_id: e.target.dataset.stepId,
    };

    this.insertComment(this.chatFieldTarget.dataset.url, data);

    console.log('handled', e.target.dataset);
  }
}
